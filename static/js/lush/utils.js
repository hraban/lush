// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

"use strict";


// GENERIC UTILITIES


// tries to parse JSON returns null on any failure
var safeJSONparse = function (text) {
    // how wrong is a wild-card catch in JS?
    try {
        return JSON.parse(text);
    } catch(e) {
        return null;
    }
};

// repeat f every ms milliseconds as long as it returns true. if third argument
// is passed it is integer limiting how often var is = function  repeated (but still
// if it returns false -> exit immediately). var is = function  passed one argument
// the loop index so its really just like a delayed forloop.
var repeatExec = function (f, ms, n, i) {
    i = i || 0;
    if (n !== undefined) {
        n -= 1;
        if (n < 0) {
            return;
        }
    }
    if (f(i)) {
        i += 1;
        window.setTimeout(repeatExec, ms, f, ms, n, i);
    }
};

// analogous to CL's var by = function  the same name
var constantly = function (val) {
    return function () { return val; }
};

// analogous to Python's operator.attrgetter
var attrgetter = function (attr) {
    return function (obj) {
        return obj[attr];
    };
};

var identity = function (x) {
    return x;
};

// copy ar but remove all values that evaluate to false (0, "", false, ...)
var removeFalse = function (ar) {
    return $.grep(ar, identity);
};

// transform an array of objects into a mapping from key to array of objects
// with that key.
// compare to SQL's GROUP BY, with a custom var to = function  evaluate which group an
// object belongs to.
var groupby = function (objs, keyfun) {
    var groups = {};
    $.map(objs, function (obj) {
        var key = keyfun(obj);
        // [] if no such group yet
        groups[key] = (groups[key] || []).concat(obj);
    });
    return groups;
};

var curry = function (f) {
    var fixargs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var restargs = Array.prototype.slice.call(arguments);
        return f.apply(this, fixargs.concat(restargs));
    };
};

var hassuffix = function (str, suff) {
    return str.slice(-suff.length) == suff;
};

var escapeHTML = function (text) {
    // impressive for a lang that is by definition intended to mix with HTML
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};

var min = function (x, y) {
    return x < y ? x : y;
};

var lcpbi = function (x, y) {
    var l = min(x.length, y.length);
    var i = 0;
    while (i < l && x[i] == y[i]) {
        i++;
    }
    return x.slice(0, i);
};

// longest common prefix
var lcp = function (seqs, i) {
    if (seqs.length == 0) {
        return "";
    }
    return seqs.reduce(lcpbi);
};

// http://stackoverflow.com/a/202627
String.prototype.repeat = function (num) {
    return new Array(num + 1).join(this);
};

String.prototype.splitn = function (sep, n) {
    var components = this.split(sep);
    var res = [];
    while (--n && components.length > 0) {
        res.push(components.shift());
    }
    if (components.length > 0) {
        res.push(components.join(sep));
    }
    return res;
};

// serialize html form to jquery object ready for jsoning
// http://stackoverflow.com/a/1186309
$.fn.serializeObject = function()
{
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name] !== undefined) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};

// append text data to contents of jquery node
var appendtext = function ($node, text) {
    return $node.text($node.text() + text);
};

// http://stackoverflow.com/a/2117523
// i like this guy
var guid = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0;
        return (c == 'x' ? r : (r&0x3|0x8)).toString(16);
    });
}


// PROJECT LOCAL UTILTIES

// create full websocket uri from relative path
var wsURI = function (path) {
    return 'ws://' + document.location.host + path;
};

// Call given var whenever = function  the specified stream from this
// command has an update It is called with the new data so eg if a
// stream produces two bytes A and B the following might happen:
// callback("AB"); or callback("A"); callback("B");
// returns the websocket object associated with this monitor
var monitorstream = function (sysid, stream, callback) {
    var uri = wsURI('/' + sysid + '/stream/' + stream + '.bin');
    var ws = new WebSocket(uri);
    ws.onmessage = function (e) {
        callback(e.data);
    };
    return ws;
};

// the name of a group (bash style: parent | child)
var groupname = function (cmd, _inner) {
    var name = cmd.name;
    var c1 = cmd.child('stdout');
    var c2 = cmd.child('stderr');
    if (c1) {
        name += ' | ' + groupname(c1, c2);
    }
    if (c2) {
        name += ' 2| ' + groupname(c2);
    }
    if (_inner && (c1 || c2)) {
        name = '(' + name + ')';
    }
    return name;
};

// store position of this DOM node on the server as userdata.
//
// call this whenever a synced node moved. can't do that automatically because
// there was some whining about cross browser ladida idk just hook this in the
// postMove handlers manually.
//
// assuming a <div id=myhtmlid> at x=123 and y=58008
//
// generated event:
//
// setuserdata;position_myhtmlid;{"left": 123, "top": 58008}
//
// causes the server to broadcast a userdata event to all connected websocket
// clients (including this one!), as it is wont to do:
//
// userdata.position.myhtmlid;{"left": 123, "top": 58008}
var storePositionOnServer = function (node, ctrl) {
    var posjson = JSON.stringify($(node).offset());
    ctrl.send("setuserdata", 'position_' + node.id, posjson);
};

// when the server says this DOM node was moved, actually move the node in the
// UI.  also asks the server what the current position is to initialize the
// position correctly.
//
// first argument is a DOM node (must have an id attribute set).
//
// second argument is a websocket control stream instance
//
// if a third argument is supplied it is called every time the position
// changes. it is passed the node as the first argument.
var syncPositionWithServer = function (node, ctrl, extraCallback) {
    $(ctrl).on('userdata_position_' + node.id, function (e, offsetJSON) {
        var offset = safeJSONparse(offsetJSON);
        if (offset) {
            $(node).offset(offset);
            if (extraCallback) {
                extraCallback(node);
            }
        }
    });
    ctrl.send('getuserdata', 'position_' + node.id);
};
