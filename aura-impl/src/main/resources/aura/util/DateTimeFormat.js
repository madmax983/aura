/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * DateTimeFormat class for AuraLocalizationService.
 * This class is implemented by browsers native Intl APIs.
 *
 * @param {string} formatString - A string containing tokens to format a date and time.
 * @param {string} localeName - A locale which is supported by Intl.DateTimeFormat.
 *
 * @constructor
 */
Aura.Utils.DateTimeFormat = function(formatString, localeName) {
    this.locale = $A.localizationService.createLocale(localeName);
    this.localeName = this.locale.getName();
    this.supportFormatToParts = $A.localizationService.canFormatToParts();

    this.tokens = this.parseFormatStringToTokens(formatString);

    this.config = {};

    this.hydrateTokensAndConfig(this.tokens, this.config);
};

/**
 * Format date to a localized string.
 *
 * This method is only used in framework. We assume date is valid here.
 *
 * @param {Date} date - A valid date.
 * @param {number} utcOffset - The time zone offset from UTC in minute.
 *   For now, we need it to be a parameter, because Intl doesn't give the current format.
 */
Aura.Utils.DateTimeFormat.prototype.format = function(date, utcOffset) {
    var parts;
    if (this.supportFormatToParts === true) {
        // Initiates the date time format when it gets called for the first time.
        if (this.dateTimeFormat === undefined) {
            this.dateTimeFormat = Intl["DateTimeFormat"](this.localeName, this.config);
        }
        parts = this.dateTimeFormat["formatToParts"](date);
    }

    // if offset is not given, using local offset
    if (utcOffset === undefined) {
        utcOffset = date.getTimezoneOffset() * -1 || 0;
    }

    var dateTimeString = "";
    for (var i = 0; i < this.tokens.length; i++) {
        var token = this.tokens[i];
        if (token["literal"] === true) {
            dateTimeString += token["value"];
        } else if (token["type"] === "number") {
            var value = this.getNumberFieldValue(token, date);
            dateTimeString += this.formatNumberField(value, (token["minDigits"] || 1), token["localized"]);
        } else if (token["type"] === "string") {
            switch (token["field"]) {
                case "dayperiod":
                    // special case
                    dateTimeString += this.locale.getMeridiem(date);
                    break;
                case "month":
                    dateTimeString += this.locale.getMonth(date.getMonth(), token["style"]);
                    break;
                case "weekday":
                    dateTimeString += this.locale.getWeekday(date.getDay(), token["style"]);
                    break;
                default:
                    dateTimeString += this.formatStringField(token["config"], date);
            }
        } else if (token["type"] === "localizedFormat") {
            var dateTimeFormat = Intl["DateTimeFormat"](this.localeName, token["config"]);
            dateTimeString += $A.localizationService.format(dateTimeFormat, date);
        } else if (token["field"] === "offset") {
            if (token["zone"] !== undefined) {
                // This is to support 'z' token for datetime in UTC.
                // It's a moment leaking, we should consider deprecating it.
                if (utcOffset === 0) {
                    dateTimeString += token["zone"];
                }
            } else {
                dateTimeString += this.formatOffset(utcOffset, token["delimiter"]);
            }

        } else {
            dateTimeString += $A.localizationService.findField(parts, token["field"]) || "";
        }
    }

    return dateTimeString;
};

/**
 * Parse datetime string into Date object.
 *
 * @param {String} dateTimeString
 * @param {Boolean} strictParsing
 * @param {Boolean} isUTC
 * @returns {Date} A date for the given datetime string, null if datetime string represents an invalid date.
 */
Aura.Utils.DateTimeFormat.prototype.parse = function(dateTimeString, strictParsing, isUTC) {
    // the values in config should be all numbers
    var config = {};

    for (var i = 0; i < this.tokens.length && dateTimeString.length > 0; i++) {
        var token = this.tokens[i];
        var value = token["value"];
        var parsedString;

        // Hmmss, hmmss, kmmss
        if (token["field"] === "hour" && value.length === 1) {
            var nextToken = this.tokens[i + 1];
            if (nextToken && nextToken["value"] === "mm") {
                value = value + "mm";
                i += 1;

                nextToken = this.tokens[i + 1];
                if (nextToken && nextToken["value"] === "ss") {
                    value = value + "ss";
                    i += 1;
                }
            }
        }

        // localizedFormat is only for formatting
        if (token["literal"] === true || token["type"] === "localizedFormat") {
            // matching from start
            parsedString = value;
        } else {
            var pattern = this.getRegExpPattern(value, strictParsing);
            var match = dateTimeString.match(pattern);
            if (match) {
                parsedString = match[0];
                switch (token["field"]) {
                    case "offset":
                        config["offset"] = $A.localizationService.parseOffset(parsedString);
                        break;
                    case "month":
                        // Note: 1-12 means Jan - Dec in config
                        config["month"] = this.locale.parseMonth(parsedString, token["style"] || this.config["month"]) + 1;
                        break;
                    case "dayperiod":
                        config["isPM"] = this.locale.isPM(parsedString);
                        break;
                    case "weekday":
                        // for verification
                        config["weekday"] = this.locale.parseWeekday(parsedString, token["style"] || this.config["weekday"]);
                        break;
                    case "hour":
                        // Grouped pattern, Hmm, Hmmss, hmm, ...
                        if (match.length > 1) {
                            config["hour"] = parseInt(match[1]);
                            config["minute"] = parseInt(match[2]);
                            if (match.length === 4) {
                                config["second"] = parseInt(match[3]);
                            }
                        } else {
                            config["hour"] = parseInt(parsedString);
                        }
                        break;
                    default:
                        // if it's hour, need to figure out the cycle
                        config[token["field"]] = parseInt(parsedString);
                }
            } else {
                if (strictParsing) {
                    return null;
                }
                parsedString = value;
            }

        }

        var matchStart = dateTimeString.indexOf(parsedString);
        if (matchStart < 0) {
            return null;
        }

        var remainingStart = matchStart + parsedString.length;
        dateTimeString = dateTimeString.substring(remainingStart);
    }

    if (strictParsing && (i !== this.tokens.length || dateTimeString.length > 0)) {
        return null;
    }

    var date = new Date();

    var year = config["year"] || date.getFullYear();
    var month = config["month"] || date.getMonth() + 1;
    var day = config["day"] || date.getDate();

    if (!$A.localizationService.isValidDate(year, month, day)) {
        return null;
    }

    var hour = config["hour"] || 0;
    if (config["isPM"]) {
        hour = (hour % 12) + 12;
    }
    var minute = config["minute"] || 0;
    var second = config["second"] || 0;
    var millisecond = config["millisecond"] || 0;
    if (!$A.localizationService.isValidTime(hour, minute, second, millisecond)) {
        return null;
    }

    var utcOffset = config["offset"];
    // Invalid offset
    if (utcOffset === null) {
        return null;
    } else if (utcOffset) {
        minute -= utcOffset;
    }

    // if offset is given, then given time is relative to UTC
    if (isUTC || utcOffset !== undefined) {
        date.setUTCFullYear(year, month - 1, day);
        date.setUTCHours(hour, minute, second, millisecond);
    } else {
        date.setFullYear(year, month - 1, day);
        date.setHours(hour, minute, second, millisecond);
    }

    return date;
};

/**
 *  Get RegExp pattern for the given token string.
 *
 * @param {String} tokenString
 * @param {Boolean} strictParsing
 */
Aura.Utils.DateTimeFormat.prototype.getRegExpPattern = function(tokenString, strictParsing) {

    switch (tokenString) {
        case "y":
        case "Y":
            return $A.localizationService.UNSIGNED_NUMBER;

        case "E":
            return $A.localizationService.DIGIT1;

        case "M":
        case "d":
        case "D":
        case "H":
        case "h":
        case "k":
        case "m":
        case "s":
            return $A.localizationService.DIGIT1_2;

        case "yy":
        case "YY":
        case "MM":
        case "dd":
        case "DD":
        case "HH":
        case "hh":
        case "kk":
        case "mm":
        case "ss":
            return strictParsing ?
                $A.localizationService.DIGIT2 :
                $A.localizationService.DIGIT1_2;

        case "yyyy":
        case "YYYY":
            return strictParsing ?
                $A.localizationService.DIGIT4 :
                $A.localizationService.DIGIT1_4;

        case "MMM":
            return this.locale.getShortMonthPattern();

        case "MMMM":
            return this.locale.getLongMonthPattern();

        case "EE":
            // The narrow type string may be ambiguous, like Tue and Thur are both T.
            // We may not want to validate on this.
            return this.locale.getNarrowWeekdayPattern();

        case "EEE":
            return this.locale.getShortWeekdayPattern();

        case "EEEE":
            return this.locale.getLongWeekdayPattern();

        case "Hmm":
        case "hmm":
        case "kmm":
            return $A.localizationService.HOUR_MIN;
        case "Hmmss":
        case "hmmss":
        case "kmmss":
            return $A.localizationService.HOUR_MIN_SEC;

        case "S":
            return strictParsing ?
                $A.localizationService.DIGIT1 :
                $A.localizationService.DIGIT1_3;
        case "SS":
            return strictParsing ?
                $A.localizationService.DIGIT2 :
                $A.localizationService.DIGIT1_3;
        case "SSS":
            return strictParsing ?
                $A.localizationService.DIGIT3 :
                $A.localizationService.DIGIT1_3;

        case "a":
        case "A":
            return this.locale.getMeridiemPattern();

        case "Z":
        case "ZZ":
            return $A.localizationService.ISO_OFFSET_PATTERN;
    }

};

/**
 * Get the number value for token from the given date.
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.getNumberFieldValue = function(token, date) {
    switch (token["field"]) {
        case "quarter":
            return $A.localizationService.quarterInYear(date);
        case "weekInYear":
            return $A.localizationService.weekInYear(date);
        case "weekday":
            return date.getDay();
        case "year":
            var year = date.getFullYear();
            if (token["style"] === "2-digit") {
                year = year%100;
            }
            return year;
        case "month":
            return date.getMonth() + 1;
        case "day":
            return date.getDate();
        case "hour":
            // 0 - 23 by default
            var hour = date.getHours();
            var hourCycle = token["hourCycle"];
            if (hourCycle !== undefined) {
                if (hourCycle === "h24") {
                    return hour === 0? 24 : hour;
                } else if (hourCycle === "h12") {
                    hour = hour % 12;
                    return hour === 0? 12 : hour;
                }
            }
            return hour;
        case "minute":
            return date.getMinutes();
        case "second":
            return date.getSeconds();
        case "millisecond":
            return date.getMilliseconds();
    }
};

/**
 * Format time zone offset into an ISO 8601 string.
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.formatOffset = function(offsetInMinute, delimiter) {
    var offsetString;
    if (offsetInMinute < 0) {
        offsetString = "-";
        offsetInMinute *= -1;
    } else {
        offsetString = "+";
    }

    offsetString += this.formatNumberField(offsetInMinute / 60, 2);
    if (delimiter === true) {
        offsetString += ":";
    }

    return  offsetString + this.formatNumberField(offsetInMinute % 60, 2);
};

/**
 * Format an token with string type. Used in format().
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.formatStringField = function(dateTimeFormatConfig, date) {
    var dateTimeFormat = new Intl["DateTimeFormat"](this.locale, dateTimeFormatConfig);
    return $A.localizationService.format(dateTimeFormat, date);
};

/**
 * Format an token with number type. Used in format().
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.formatNumberField = function(num, minDigits, localized) {
    if (!localized) {
        var numString = num.toString();
        if (numString.length < minDigits) {
            return (Array(minDigits).join("0") + numString).slice(-minDigits);
        } else {
            return numString.toString();
        }
    }

    return new Intl["NumberFormat"](this.locale, {
        "useGrouping": false,
        "minimumIntegerDigits": minDigits,
        "maximumFractionDigits": 0
    })["format"](num);

};

/**
 * Adding detailed formatting info to tokens which parsed out from format strings and date time format config.
 * The date time config is only used when Intl.DateTimeFormat.formatToParts() is supported.
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.hydrateTokensAndConfig = function(tokens, config) {
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        if (token["literal"] === true) {
            continue;
        }

        switch (token["value"]) {
            // years
            case "y":
            case "Y": // leaked moment token
            case "yyyy":
            case "YYYY": // leaked moment token
                token["field"] = "year";
                if (this.canUseConfig("year", "numeric")) {
                    config["year"] = "numeric";
                } else {
                    token["type"] = "number";
                    token["localized"] = true;
                }
                break;
            case "yy":
            case "YY": // leaked moment token
                token["field"] = "year";
                if (this.canUseConfig("year", "2-digit")) {
                    config["year"] = "2-digit";
                } else {
                    token["type"] = "number";
                    token["style"] = "2-digit";
                    token["minDigits"] = 2;
                    token["localized"] = true;
                }
                break;

            // months
            case "M":
                token["field"] = "month";
                if (this.canUseConfig("month", "numeric")) {
                    config["month"] = "numeric";
                } else {
                    token["type"] = "number";
                    token["localized"] = true;
                }
                break;
            case "MM":
                token["field"] = "month";
                if (this.canUseConfig("month", "2-digit")) {
                    config["month"] = "2-digit";
                } else {
                    token["type"] = "number";
                    token["minDigits"] = 2;
                    token["localized"] = true;
                }
                break;
            case "MMM":
                token["field"] = "month";
                if (this.canUseConfig("month", "short")) {
                    config["month"] = "short";
                } else {
                    token["type"] = "string";
                    token["style"] = "short";
                }
                break;
            case "MMMM":
                token["field"] = "month";
                if (this.canUseConfig("month", "long")) {
                    config["month"] = "long";
                } else {
                    token["type"] = "string";
                    token["style"] = "long";
                }
                break;

            // dates
            case "d":
            case "D": // leaked moment token
                token["field"] = "day";
                if (this.canUseConfig("day", "numeric")) {
                    config["day"] = "numeric";
                } else {
                    token["type"] = "number";
                    token["localized"] = true;
                }
                break;
            case "dd":
            case "DD": // leaked moment token
                token["field"] = "day";
                if (this.canUseConfig("day", "2-digit")) {
                    config["day"] = "2-digit";
                } else {
                    token["type"] = "number";
                    token["minDigits"] = 2;
                    token["localized"] = true;
                }
                break;

            // hours
            case "H":
                // process individually, since 2-digit will be used when 'hour12' is off
                token["field"] = "hour";
                token["type"] = "number";
                token["localized"] = true;
                break;
            case "HH":
                token["field"] = "hour";
                if (this.canUseConfig("hour", "2-digit")) {
                    config["hour"] = "2-digit";
                    config["hour12"] = false;
                } else {
                    token["type"] = "number";
                    token["minDigits"] = 2;
                    token["localized"] = true;
                }
                break;
            case "h":
                token["field"] = "hour";
                if (this.canUseConfig("hour", "numeric")) {
                    config["hour"] = "numeric";
                    config["hour12"] = true;
                } else {
                    token["type"] = "number";
                    token["hourCycle"] = "h12";
                    token["localized"] = true;
                }
                break;
            case "hh":
                // process individually, since 2-digit will be ignored when 'hour12' is on
                token["field"] = "hour";
                token["type"] = "number";
                token["minDigits"] = 2;
                token["hourCycle"] = "h12";
                token["localized"] = true;

                // 'hour' setting is still needed to show minute
                config["hour"] = "2-digit";
                config["hour12"] = true;
                break;
            case "k":
                // process individually, since 'hourCycle' is not on all browsers
                token["field"] = "hour";
                token["type"] = "number";
                token["hourCycle"] = "h24";
                token["localized"] = true;

                // 'hour' setting is still needed to show minute
                config["hour"] = "numeric";
                break;
            case "kk":
                token["field"] = "hour";
                token["type"] = "number";
                token["minDigits"] = 2;
                token["hourCycle"] = "h24";
                token["localized"] = true;

                config["hour"] = "2-digit";
                break;

            // minutes
            case "m":
                token["field"] = "minute";
                if (this.canUseConfig("minute", "numeric")) {
                    config["minute"] = "numeric";
                } else {
                    token["type"] = "number";
                    token["localized"] = true;
                }
                break;
            case "mm":
                // process individually, since 0 is not formatted as 2-digit if hour is numeric
                token["field"] = "minute";
                token["type"] = "number";
                token["minDigits"] = 2;
                token["localized"] = true;

                // 'minute' setting is still needed to show second
                config["minute"] = "2-digit";
                break;

            // seconds
            case "s":
                token["field"] = "second";
                if (this.canUseConfig("second", "numeric")) {
                    config["second"] = "numeric";
                } else {
                    token["type"] = "number";
                }
                break;
            case "ss":
                token["field"] = "second";
                if (this.canUseConfig("second", "2-digit")) {
                    config["second"] = "2-digit";
                } else {
                    token["type"] = "number";
                    token["minDigits"] = 2;
                }
                break;

            // milliseconds
            case "S":
                token["field"] = "millisecond";
                token["type"] = "number";
                break;
            case "SS":
                token["field"] = "millisecond";
                token["type"] = "number";
                token["minDigits"] = 2;
                break;
            case "SSS":
                token["field"] = "millisecond";
                token["type"] = "number";
                token["minDigits"] = 3;
                break;

            // meridiem
            case "a":
            case "A": // leaked moment token
                token["field"] = "dayperiod";
                if (this.canUseConfig("hour12", true)) {
                    config["hour12"] = true;
                    // 'hour' is needed to show dayperiod
                    // if hour12 is on, 'hour' can only be numeric, see 'hh'
                    config["hour"] = "numeric";
                } else {
                    token["type"] = "string";
                }
                break;

            // time zone offset
            case "Z":
                token["field"] = "offset";
                token["delimiter"] = true;
                break;
            case "ZZ":
                token["field"] = "offset";
                token["delimiter"] = false;
                break;
            case "z": // leaked moment token
                token["field"] = "offset";
                token["zone"] = "UTC";
                break;

            // day in week
            case "E":
                token["field"] = "weekday";
                token["type"] = "number";
                token["localized"] = true;
                break;
            case "EE":
                token["field"] = "weekday";
                if (this.canUseConfig("weekday", "narrow")) {
                    config["weekday"] = "narrow";
                } else {
                    token["type"] = "string";
                    token["style"] = "narrow";
                }
                break;
            case "EEE":
                token["field"] = "weekday";
                if (this.canUseConfig("weekday", "short")) {
                    config["weekday"] = "short";
                } else {
                    token["type"] = "string";
                    token["style"] = "short";
                }
                break;
            case "EEEE":
                token["field"] = "weekday";
                if (this.canUseConfig("weekday", "long")) {
                    config["weekday"] = "long";
                } else {
                    token["type"] = "string";
                    token["style"] = "long";
                }
                break;
            case "Q":
                token["field"] = "quarter";
                token["type"] = "number";
                break;

            // week in year
            case "w":
                token["field"] = "weekInYear";
                token["type"] = "number";
                token["localized"] = true;
                break;
            case "ww":
                token["field"] = "weekInYear";
                token["type"] = "number";
                token["minDigits"] = 2;
                token["localized"] = true;
                break;


            // Localized format
            case "LT":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "hour": "numeric",
                    "minute": "numeric"
                };
                break;
            case "LTS":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "hour": "numeric",
                    "minute": "numeric",
                    "second": "numeric"
                };
                break;
            case "L":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "2-digit",
                    "day": "2-digit"
                };
                break;
            case "l":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "numeric",
                    "day": "numeric"
                };
                break;
            case "LL":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "long",
                    "day": "numeric"
                };
                break;
            case "ll":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "short",
                    "day": "numeric"
                };
                break;
            case "LLL":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "long",
                    "day": "numeric",
                    "hour": "numeric",
                    "minute": "numeric"
                };
                break;
            case "lll":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "short",
                    "day": "numeric",
                    "hour": "numeric",
                    "minute": "numeric"
                };
                break;
            case "LLLL":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "long",
                    "day": "numeric",
                    "hour": "numeric",
                    "minute": "numeric",
                    "weekday": "long"
                };
                break;
            case "llll":
                token["type"] = "localizedFormat";
                token["config"] = {
                    "year": "numeric",
                    "month": "short",
                    "day": "numeric",
                    "hour": "numeric",
                    "minute": "numeric",
                    "weekday": "short"
                };
                break;

            default:
                token["literal"] = true;
        }
    }

    return config;
};

/**
 * Parse the format string into tokens.
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.parseFormatStringToTokens = function(formatString) {
    var tokens = [];

    // split by escapsed string, 'LT', 'LTS'
    var splits = formatString.split(/(\[[^\[\]]*\]|LTS?)/g);
    for (var i = 0; i < splits.length; i++) {
        var str = splits[i];
        if (!str) {
            continue;
        }

        if (str.charAt(0) === "[" && str.slice(-1) === "]") {
            // escaped string
            if (str.length > 2) {
                var value = str.substring(1, str.length - 1);
                tokens.push({ "literal": true, "value": value });
            }
        } else if (str === "LT" || str === "LTS") {
            tokens.push({ literal: false, "value": str });
        } else {
            var currentChar = null;
            var currentStr = "";
            for (var n = 0; n < str.length; n++) {
                var c = str.charAt(n);
                if (c === currentChar) {
                    currentStr += c;
                } else {
                    if (currentStr.length > 0) {
                        tokens.push({ "literal": false, "value": currentStr });
                    }
                    currentStr = c;
                    currentChar = c;
                }
            }
            if (currentStr.length > 0) {
                tokens.push({ literal: false, "value": currentStr });
            }
        }
    }

    return tokens;
};

/**
 * Note: we can use DateTimeFormat config to get the value ONLY IF
 *   1) the broswer supports formatToParts()
 *   2) different representation for same field does not exist in the config bag (undefined or same string)
 * @private
 */
Aura.Utils.DateTimeFormat.prototype.canUseConfig = function(field, setting) {
    return this.supportFormatToParts === true && (this.config[field] === undefined || this.config[field] === setting);
};
