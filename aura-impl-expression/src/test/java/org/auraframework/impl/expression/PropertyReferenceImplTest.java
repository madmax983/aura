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
package org.auraframework.impl.expression;

import java.util.List;

import org.auraframework.expression.PropertyReference;
import org.auraframework.system.Location;
import org.junit.Assert;
import org.junit.Test;

/**
 * expressiony test
 */
public class PropertyReferenceImplTest {

    @Test
    public void testExpression() throws Exception {
        Location loc = new Location("expressionism", 456);
        PropertyReferenceImpl pr = new PropertyReferenceImpl("test.yo.self", loc);
        Assert.assertSame(loc, pr.getLocation());
        Assert.assertEquals("root was not correct", "test", pr.getRoot());
        Assert.assertEquals(3, pr.size());
        List<String> l = pr.getList();
        Assert.assertEquals("test", l.get(0));
        Assert.assertEquals("yo", l.get(1));
        Assert.assertEquals("self", l.get(2));
        PropertyReference pr2 = pr.getStem();
        Assert.assertSame(loc, pr2.getLocation());
        Assert.assertEquals("root was not correct", "yo", pr2.getRoot());
        PropertyReference pr3 = pr2.getStem();
        Assert.assertSame(loc, pr3.getLocation());
        Assert.assertEquals("root was not correct", "self", pr3.getRoot());
        Assert.assertEquals(1, pr3.size());
    }

    @Test
    public void testSimpleExpression() throws Exception {
        Location loc = new Location("expressionism", 92);
        PropertyReferenceImpl pr = new PropertyReferenceImpl("inohaveanydots", loc);
        Assert.assertSame(loc, pr.getLocation());
        Assert.assertEquals("root was not correct", "inohaveanydots", pr.getRoot());
        Assert.assertEquals(1, pr.size());
        Assert.assertNull("stem should have been null", pr.getStem());
    }

    @Test
    public void testToString() throws Exception {
        Location loc = new Location("expressionism", 92);
        PropertyReferenceImpl pr = new PropertyReferenceImpl("test.yo.self", loc);
        Assert.assertEquals("test.yo.self", pr.toString());
    }
}
