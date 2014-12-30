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

// GENERIC UTILITIES

/// <reference path="refs/jquery.d.ts" />
/// <reference path="Command.ts"/>

import $ = require("jquery");

// prefix all special chars in arg by backslash
export function parserEscape(txt) {
    return txt.replace(/([\\?*\s"'])/g, "\\$1");
}

// undo parserEscape
export function parserUnescape(txt) {
    return txt.replace(/\\(.)/g, "$1");
}


// tries to parse JSON returns null on any failure
export function safeJSONparse(text) {
    // how wrong is a wild-card catch in JS?
    try {
        return JSON.parse(text);
    } catch(e) {
        return null;
    }
}

// analogous to CL's var by = function  the same name
export function constantly(val) {
    return function () { return val; }
}

// analogous to Python's operator.attrgetter
export function attrgetter(attr) {
    return function (obj) {
        return obj[attr];
    };
}

export function identity(x) {
    return x;
}

// copy ar but remove all values that evaluate to false (0, "", false, ...)
export function removeFalse(ar) {
    return $.grep(ar, identity);
}

// transform an array of objects into a mapping from key to array of objects
// with that key.
// compare to SQL's GROUP BY, with a custom var to = function  evaluate which group an
// object belongs to.
export function groupby(objs, keyfun) {
    var groups = {};
    $.map(objs, function (obj) {
        var key = keyfun(obj);
        // [] if no such group yet
        groups[key] = (groups[key] || []).concat(obj);
    });
    return groups;
}

export function curry(f) {
    var fixargs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var restargs = Array.prototype.slice.call(arguments);
        return f.apply(this, fixargs.concat(restargs));
    };
}

export function hassuffix(str, suff) {
    return str.slice(-suff.length) == suff;
}

export function escapeHTML(text) {
    // impressive for a lang that is by definition intended to mix with HTML
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function min(x, y) {
    return x < y ? x : y;
}

export function lcpbi(x, y) {
    var l = min(x.length, y.length);
    var i = 0;
    while (i < l && x[i] == y[i]) {
        i++;
    }
    return x.slice(0, i);
}

// longest common prefix
export function lcp(seqs: string[]) {
    if (seqs.length == 0) {
        return "";
    }
    return seqs.reduce(lcpbi);
}

// append text data to contents of jquery node
export function appendtext($node, text) {
    return $node.text($node.text() + text);
}

// http://stackoverflow.com/a/2117523
// i like this guy
export function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0;
        return (c == 'x' ? r : (r&0x3|0x8)).toString(16);
    });
}


// PROJECT LOCAL UTILTIES

export function stringStartsWith(str, prefix) {
    return str.lastIndexOf(prefix, 0) === 0;
}

// create full websocket uri from relative path
export function wsURI(path) {
    if (stringStartsWith(path, "ws://")) {
        return path;
    }
    return 'ws://' + document.location.host + path;
}

// Call given var whenever = function  the specified stream from this
// command has an update It is called with the new data so eg if a
// stream produces two bytes A and B the following might happen:
// callback("AB"); or callback("A"); callback("B");
// returns the websocket object associated with this monitor
export function monitorstream(sysid, stream, callback) {
    var uri = wsURI('/' + sysid + '/stream/' + stream + '.bin');
    var ws = new WebSocket(uri);
    ws.onmessage = function (e) {
        callback(e.data);
    };
    return ws;
}

function isPromise(x: any) {
    return x !== undefined && $.isFunction(x.then);
}

// f acts on l, which is a tree with implicit nodes, the next node is extracted
// using nextkey, which returns undefined if there is no next node. If f
// returns a deferred, this function only progresses on success. if reversed is
// true, call last element first.
// TODO: return type should be void|JQueryDeferred<void>
export function mapf<T>(f: (node: T) => any, l: T, nextkey: (node: T) => T, reversed?: boolean): any {
    if (l === undefined) {
        return $.Deferred().resolve();
    }
    var recurse = () => mapf(f, nextkey(l), nextkey, reversed);
    if (reversed) {
        // always a promise in reverse mode
        return recurse().then(f(l));
    } else {
        var ret = f(l);
        if (isPromise(ret)) {
            return ret.then(recurse);
        } else {
            return recurse();
        }
    }
}

// PUZZLE BELOW!
//
// It took me much too long to get this function (noConcurrentCalls) right.
// Feeling strong? Try looking at the unit tests and implement a version that
// works without looking at the implementation.

// wait for d1 to complete, then proxy that to d2
export function pipeDeferred(d1, d2) {
    d1.done(d2.resolve.bind(d2)).fail(d2.reject.bind(d2));
}

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
export function noConcurrentCalls(f) {
    var running:JQueryPromise<any> = $.Deferred().resolve();
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
            pipeDeferred(cd, d);
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
}

export function scrollToBottom(el) {
    if (undefined === el) {
        throw new TypeError("container div to scroll argument required");
    }
    if (typeof el === "string") {
        el = document.getElementById(el);
    }
    if (!(el instanceof HTMLElement)) {
        throw new Error("Not a valid DOM node");
    }
    el.scrollTop = el.scrollHeight;
}

export function isInt(i) {
    return (typeof i === 'number') && (i % 1 === 0);
}

export function isString(x) {
    return typeof x === "string";
}

export function splitn(str, sep, n) {
    var components = str.split(sep);
    var res = [];
    while (--n && components.length > 0) {
        res.push(components.shift());
    }
    if (components.length > 0) {
        res.push(components.join(sep));
    }
    return res;
}

// "blabla123" -> int(123)
export function parseTrailingInteger(str: string): number {
    var match = /\d+$/.exec(str);
    if (match === null) {
        throw new Error("No trailing numbers in input");
    }
    return +(match[0]);
}

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

// putting jquery UI tabs on bottom of this element 
if (!$.fn.tabsBottom) {
    $.fn.tabsBottom = function (options) {
        this.tabs(options);
        // fix the classes of containers when tabs are bottom
        this.find(".tabs-bottom .ui-tabs-nav, .tabs-bottom .ui-tabs-nav > *")
            .removeClass("ui-corner-all ui-corner-top")
            .addClass("ui-corner-bottom");
        // move the nav DOM node to the bottom of its parent
        this.find(".tabs-bottom").append(this.find(".ui-tabs-nav"));
        return this;
    };
}

if (!$.fn.assertNum) {
    $.fn.assertNum = function (num: number) {
        if (this.length != num) {
            throw new Error("Expected " + num + " elements, but got " + this.length + ".");
        }
        return this;
    };
}
