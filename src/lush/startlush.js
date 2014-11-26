// Copyright © 2014 Hraban Luyat <hraban@0brg.net>
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

var $ = require("jquery");
// HACK JQUERY UI + BROWSERIFY + LORDHAVEMERCIFY
// javascript: the build experience of C, the speed of Python and the type
// safety of assembly. But even assembly will generate linker errors.
window.jQuery = $;
require("jquery-ui");

var main = require("./main");

// actual start, no arguments, no funny stuff
function startLush() {
    $.get("/config/websocketbase.txt").then(function (url) {
        return url.trim();
    }, function () {
        var d = $.Deferred();
        // default baseurl is empty string
        d.resolve("");
        // continue on the success path (return ""; continues on fail path)
        return d;
    }).then(function (baseurl) {
        main(baseurl + "/ctrl");
    });
}

module.exports = startLush;
