// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

/// <reference path="refs/jquery.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="Ctrl.ts" />

import $ = require("jquery");
import U = require("./utils");
import Ctrl = require("./Ctrl");

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
export function initPathUI($form, ctrl: Ctrl.Ctrl) {
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
