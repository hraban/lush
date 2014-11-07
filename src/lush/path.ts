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

/// <reference path="refs/jquery.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="Ctrl.ts" />

import $ = require("jquery");
import U = require("lush/utils");
import Ctrl = require("lush/Ctrl");

function createPathInput(dir) {
    return $('<li class="ui-state-default">').append([
        // when a path changes submit the entire new path
        $('<input>')
            .val(dir)
            .change(function () {
                $(this).closest('form').submit();
            })
            .keypress(function () {
                var w = ((this.value.length + 1) * 8);
                if (w < 200) {
                    w = 200;
                }
                this.style.width = w + 'px';
            })
            .keypress(),
        // delete path button
        $('<button>×</button>').click(function () {
            var $form = $(this).closest('form');
            $(this).closest('li').remove();
            // when a path is removed submit the entire new path
            $form.submit()
            return false;
        }),
    ]);
};

// Initialization for the PATH UI
export function initPathUI($form, ctrl: Ctrl) {
    // Hook up form submission to ctrl channel
    $form.submit(function () {
            var paths = $.map($('input', $form), U.attrgetter('value'));
            // filter out empty paths
            paths = $.grep(paths, U.identity);
            ctrl.send('setpath', JSON.stringify(paths));
            return false;
        })
        // + button to allow creating entirely new PATH entries
        .after($('<button>+</button>').click(function () {
            $('ol', $form).append(createPathInput(''))
            return false;
        }))
        // reordering path entries is also an edit
        .find('ol').on("sortstop", function () {
            $form.submit();
        });
    // Refresh form when server notifies PATH changes
    $(ctrl).on("path", function (_, pathjson) {
        var dirs = JSON.parse(pathjson);
        $('ol', $form)
            .empty()
            .append($.map(dirs, createPathInput));
    });
    // Request initial PATH from server
    ctrl.send("getpath");
}
