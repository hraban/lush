// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

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
