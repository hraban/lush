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


// The logic behind the control window for active commands.

define(["jquery", "lush/utils"], function ($, U) {

    var numInstances = 0;

    var HistoryWidget = function () {
        // history widget operates on the DOM directly (hard-coded IDs, certain
        // nodes are expected, ...)
        if (numInstances++ > 0) {
            throw "HistoryWidget must not be instanciated more than once";
        }
        $('#delete_archived_and_completed').click(function (e) {
            e.preventDefault();
            $('#history .archived').each(function () {
                var gid = $(this).data('gid');
                var cmd = cmds[gid];
                if (cmd.status.code > 1) {
                    cmd.release();
                }
            });
        });
    };

    // update the name of this entire command group in the history list.
    //
    // eg:
    //
    // 1: tar f foo.tar foo
    // 3: echo lala | cat
    //
    // calling updateHistoryLiName(3) will refresh the entire second line
    function updateHistoryLiName(gid) {
        $('#history_group' + gid + ' .name').text(gid + ': ' + U.cmdChainToPrompt(cmds[gid]));
    };

    // build a <li> for this command
    function createHistoryLi(cmd) {
        var $li = $('<li id=history_group' + cmd.nid + '>')
            .data('gid', cmd.nid)
            .append($('<a href class=name>')
                .click(function (e) {
                    e.preventDefault();
                    var $li = $(this).closest('li');
                    var cmd = cmds[$li.data('gid')];
                    var currentState = $li.hasClass('archived');
                    cmd.setArchivalState(!currentState);
                }));
        if (!cmd.isRoot()) {
            $li.addClass('child');
        }
        $(cmd).on('updated.name', function () {
            var cmd = this;
            // if my name changes, so does the name of my group.  Set the text
            // of this li to the name of whatever group I belong to
            updateHistoryLiName(cmd.getGid());
        });
        $(cmd).on('archival', function (_, archived) {
            var cmd = this;
            if (archived) {
                $('#history_group' + cmd.nid).addClass('archived');
            } else {
                $('#history_group' + cmd.nid).removeClass('archived');
            }
        });
        function setChild(cmd, childid) {
            // mark the child's history entry (will hide it)
            $('#history_group' + childid).addClass('child');
            // update the name of whatever hierarchy I now belong to
            updateHistoryLiName(cmd.nid);
        }
        $(cmd).on('updated.stdoutto', function () {
            var cmd = this;
            if (cmd.stdoutto) {
                setChild(cmd, cmd.stdoutto);
            }
        });
        $(cmd).on('updated.stdoutto', function () {
            var cmd = this;
            if (cmd.stderrto) {
                setChild(cmd, cmd.stderrto);
            }
        });
        $(cmd).on('parentRemoved', function (_, olddaddy) {
            var cmd = this;
            // I'm back!
            // my name might have changed while I was a child but that will not
            // have been reflected in this LI
            updateHistoryLiName(cmd.getGid());
            // now that I'm not a child of my old hierarchy, its name has
            // changed
            updateHistoryLiName(olddaddy.gid);
            $('#history_group' + cmd.nid).removeClass('child');
        });
        $(cmd).on('wasreleased', function () {
            var cmd = this;
            $('#history_group' + cmd.nid).remove();
        });
        return $li;
    };

    HistoryWidget.prototype.addCommand = function (cmd) {
        $('#history ul').append(createHistoryLi(cmd));
    };

    return HistoryWidget;
});
