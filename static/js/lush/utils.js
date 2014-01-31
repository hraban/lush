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

define(["jquery"], function ($) {

// bite me, syntax fairy

var U = {

// prefix all special chars in arg by backslash
parserEscape: function parserEscape(txt) {
    return txt.replace(/([\\?*\s"'])/g, "\\$1");
},

// undo parserEscape
parserUnescape: function parserUnescape(txt) {
    return txt.replace(/\\(.)/g, "$1");
},


// tries to parse JSON returns null on any failure
safeJSONparse: function safeJSONparse(text) {
    // how wrong is a wild-card catch in JS?
    try {
        return JSON.parse(text);
    } catch(e) {
        return null;
    }
},

// analogous to CL's var by = function  the same name
constantly: function constantly(val) {
    return function () { return val; }
},

// analogous to Python's operator.attrgetter
attrgetter: function attrgetter(attr) {
    return function (obj) {
        return obj[attr];
    };
},

identity: function identity(x) {
    return x;
},

// copy ar but remove all values that evaluate to false (0, "", false, ...)
removeFalse: function removeFalse(ar) {
    return $.grep(ar, U.identity);
},

// transform an array of objects into a mapping from key to array of objects
// with that key.
// compare to SQL's GROUP BY, with a custom var to = function  evaluate which group an
// object belongs to.
groupby: function groupby(objs, keyfun) {
    var groups = {};
    $.map(objs, function (obj) {
        var key = keyfun(obj);
        // [] if no such group yet
        groups[key] = (groups[key] || []).concat(obj);
    });
    return groups;
},

curry: function curry(f) {
    var fixargs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var restargs = Array.prototype.slice.call(arguments);
        return f.apply(this, fixargs.concat(restargs));
    };
},

hassuffix: function hassuffix(str, suff) {
    return str.slice(-suff.length) == suff;
},

escapeHTML: function escapeHTML(text) {
    // impressive for a lang that is by definition intended to mix with HTML
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
},

min: function min(x, y) {
    return x < y ? x : y;
},

lcpbi: function lcpbi(x, y) {
    var l = U.min(x.length, y.length);
    var i = 0;
    while (i < l && x[i] == y[i]) {
        i++;
    }
    return x.slice(0, i);
},

// longest common prefix
lcp: function lcp(seqs, i) {
    if (seqs.length == 0) {
        return "";
    }
    return seqs.reduce(U.lcpbi);
},

// append text data to contents of jquery node
appendtext: function appendtext($node, text) {
    return $node.text($node.text() + text);
},

// http://stackoverflow.com/a/2117523
// i like this guy
guid: function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0;
        return (c == 'x' ? r : (r&0x3|0x8)).toString(16);
    });
},


// PROJECT LOCAL UTILTIES

// create full websocket uri from relative path
wsURI: function wsURI(path) {
    return 'ws://' + document.location.host + path;
},

// Call given var whenever = function  the specified stream from this
// command has an update It is called with the new data so eg if a
// stream produces two bytes A and B the following might happen:
// callback("AB"); or callback("A"); callback("B");
// returns the websocket object associated with this monitor
monitorstream: function monitorstream(sysid, stream, callback) {
    var uri = U.wsURI('/' + sysid + '/stream/' + stream + '.bin');
    var ws = new WebSocket(uri);
    ws.onmessage = function (e) {
        callback(e.data);
    };
    return ws;
},

// f acts on l, which is a tree with implicit nodes, the next node is extracted
// using nextkey, which returns undefined if there is no next node. also f
// returns a deferred and this function only progresses on success. as does this
// function. if reversed is true, call last element first.
mapf: function mapf(f, l, nextkey, reversed) {
    if (l === undefined) {
        return $.Deferred().resolve();
    }
    if (!$.isFunction(nextkey)) {
        throw "mapf: nextkey MUST be a function";
    }
    if (reversed) {
        return U.mapf(f, nextkey(l), nextkey, true).then(f.bind(this, l))
    } else {
        return f(l).then(U.mapf.bind(this, f, nextkey(l), nextkey));
    }
},

mapCmds: function mapCmds(f, cmd, reverse) {
    return U.mapf(f, cmd, function (cmd) { return cmd.stdoutCmd(); }, reverse);
},

// execute f on cmd and all its children, serially and top-down (not too happy
// about the code dupe with mapCmds but hey)
mapCmdTree: function mapCmdTree(cmd, f) {
    if (cmd === undefined) {
        return;
    }
    // TODO: if cmd not instanceof Command yada yada dynamic typing suck bla bla
    if (!$.isFunction(f)) {
        throw "f must be a function";
    }
    f(cmd);
    U.mapCmdTree(cmd.stdoutCmd(), f);
},

// serialize a pipeline
cmdChainToPrompt: function cmdChainToPrompt(cmd) {
    var argvs = [];
    // couldn't resist.
    U.mapCmdTree(cmd, function (cmd) {
        var argv = cmd.getArgv().map(U.parserEscape);
        argvs.push.apply(argvs, argv);
        if (cmd.stdoutto > 0) {
            argvs.push('|');
        }
    });
    return argvs.join(' ');
},

// PUZZLE BELOW!
//
// It took me much too long to get this function (noConcurrentCalls) right.
// Feeling strong? Try looking at the unit tests and implement a version that
// works without looking at the implementation.

// wait for d1 to complete, then proxy that to d2
pipeDeferred: function pipeDeferred(d1, d2) {
    d1.done(d2.resolve.bind(d2)).fail(d2.reject.bind(d2));
},

// wrap a function, that returns a deferred, to a "locked" version:
//
// (examples assuming calls 2 and 3 are made before the deferred returned by
// call 1 is rejected or resolved)
//
// first call: everything normal, proxied directly.
//
// second call: delayed until first call completes. a deferred is returned that
// resolves (or rejects) WHEN, if at all, this call completes.
//
// third call: delayed until first call completes, overriding the second call.
// i.e.: call the wrapped function three times in a row (f(1); f(2); f(3)) and
// f(2) will never actually get executed.
//
// this scales up to any number of calls: as long as the first one didn't
// complete, only the last of all subsequent calls will be executed once it's
// done.
//
// now the first call is done: back to initial state.
//
// see unit tests for details
noConcurrentCalls: function noConcurrentCalls(f) {
    var running = $.Deferred().resolve();
    var pendingf;
    return function () {
        var args = arguments;
        var closure = function () {
            return f.apply(undefined, args);
        };
        var d = $.Deferred();
        pendingf = function () {
            var exe = $.Deferred();
            var cd = closure();
            if (!cd || !$.isFunction(cd.always)) {
                throw "Return value of wrapped function must be a deferred";
            }
            cd = cd.always(function () { exe.resolve(); });
            U.pipeDeferred(cd, d);
            return exe;
        };
        running = running.then(function () {
            if (pendingf) {
                var temp = pendingf;
                pendingf = undefined;
                return temp();
            }
        });
        return d;
    };
},

}; // the U object containing all utility functions

return U;

} // the AMD wrapping function

); // requirejs define()


// these extensions don't fit in a requirejs function but they do just fine here

// haha stupid phantomjs
if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    if (typeof this !== "function") {
      // closest thing possible to the ECMAScript 5 internal IsCallable function
      throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
    }

    var aArgs = Array.prototype.slice.call(arguments, 1), 
        fToBind = this, 
        fNOP = function () {},
        fBound = function () {
          return fToBind.apply(this instanceof fNOP && oThis
                                 ? this
                                 : oThis,
                               aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

// http://stackoverflow.com/a/202627
if (!String.prototype.repeat) {
    String.prototype.repeat = function (num) {
        return new Array(num + 1).join(this);
    };
}

if (!String.prototype.spltin) {
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
}

// serialize html form to jquery object ready for jsoning
// http://stackoverflow.com/a/1186309
if (!$.fn.serializeObject) {
    $.fn.serializeObject = function () {
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
}

// hehehe
if (!document.scrollToBottom) {
    document.scrollToBottom = function () {
        var el = document.getElementById('bottomofpage');
        if (el) {
            el.scrollIntoView();
        } else {
            throw "scrollToBottom() needs an element with id 'bottomofpage'";
        }
    };
}
