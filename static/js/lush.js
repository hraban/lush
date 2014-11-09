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


// welcome!
//
// this file configures require.js for lush. external libraries (jquery etc)
// are in /static/js/ext/. lush scripts (haha go home script you're drunk) are
// all in /static/js/lush/. every file in there (except utils.js) is a "AMD"
// module that must be loaded using requirejs.
//
// to use these modules a page must first load require.js and configure it
// using this configuration file. this is how:
//
// <script src=/js/ext/require.js></script>
//
// it then chooses a module to load. e.g. the root page uses "lush/main":
//
// <script>
// requirejs(["lush/main"])
// </script>
//
// that will load /static/js/lush/main.js.

requirejs.config({
    "baseUrl": "/js/ext",
    "paths": {
        "lush": "../lush",
        "jquery": "jquery-2.0.3.min",
        "jquery.ui": "jquery-ui-1.10.2.min",
        "jquery.terminal": "jquery.terminal-0.8.6.min",
        "jsPlumb": "jquery.jsPlumb-1.5.3-min",
        "ansi_up": "ansi_up-r7e9940fdad",
        "react": "react-with-addons-0.12.0",
    },
    "shim": {
        "jquery.terminal": ["jquery"],
        "jsPlumb": ["jquery"],
        "jquery.ui": ["jquery"],
    },
    "waitSeconds": 100000, // i have the patience of a monk
});


