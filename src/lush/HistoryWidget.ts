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


// The logic behind the control window for active commands.

/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/react.d.ts" />
/// <reference path="refs/react-addons.d.ts" />
/// <reference path="Command.ts"/>
/// <reference path="utils.ts" />

import $ = require("jquery");
import React = require("react");
import U = require("./utils");
import Command = require("./Command");

declare var cmds: {};

var HistoryEntry = React.createClass({
    handleClick: function (e) {
        e.preventDefault();
        this.props.cmd.setArchivalState(!this.props.cmd.userdata.archived);
    },

    render: function () {
        var cmd = this.props.cmd;
        if (!cmd.isRoot()) {
            return null;
        }
        var classNames = React.addons.classSet({
            "history-entry": true,
            archived: cmd.userdata.archived
        });
        var myprops = {
            href: "",
            "data-gid": cmd.nid,
            key: "history-entry-" + cmd.nid,
            className: classNames,
            onClick: this.handleClick
        };
        var txt = cmd.nid + ": " + cmd.cmdChainToPrompt();
        return React.DOM.a(myprops, txt);
    }
});

// Scope jquery eventnames to local namespace
function scopeEvents(...evName: string[]): string {
    return evName.map(x => x + ".HistoryWidget").join(" ");
}

class ChangedHierarchyEvent extends Command.CommandEvent {
    static eventName = "ChangedHierarchyEvent";
}

// Build a history list entry for this command. Does not modify DOM, does not
// register cleanup handlers for DOM. Does register cleanup handlers for
// internal events, but that should be transparent.
function createHistoryEntry(cmd): HTMLElement {

    var wrapper = document.createElement("div");
    var reactel = React.createElement(HistoryEntry, {cmd: cmd});
    var component = React.render(reactel, wrapper);

    var evs = [
        Command.UpdatedArgsEvent,
        Command.UpdatedCmdEvent,
        Command.UpdatedNameEvent,
        Command.ArchivalEvent,
        ChangedHierarchyEvent
    ];
    var offs = [cmd.onany(evs, function (e) {
        var cmd = e.cmd;
        component.setProps({cmd: cmd});
    })];
    var evNames = scopeEvents("parentAdded", "parentRemoved");
    function handleParentChanged(cmd: Command.Command, dad: Command.Command) {
        dad.trigger(new ChangedHierarchyEvent());
        component.setProps({cmd: cmd});
    }
    offs.push(cmd.on(Command.ParentAddedEvent, function (e) {
        handleParentChanged(e.cmd, e.newparent);
    }));
    offs.push(cmd.on(Command.ParentRemovedEvent, function (e) {
        handleParentChanged(e.cmd, e.oldparent);
    }));
    cmd.one(Command.WasReleasedEvent, function () {
        offs.forEach(f => f());
        delete offs;
    });

    return wrapper;
};

var numInstances = 0;

class HistoryWidget {

    constructor() {
        // history widget operates on the DOM directly (hard-coded IDs, certain
        // nodes are expected, ...)
        if (numInstances++ > 0) {
            throw new Error("HistoryWidget is a singleton");
        }
        $('#delete_archived_and_completed').click(function (e) {
            e.preventDefault();
            $('#history .archived').each(function () {
                var gid = $(this).data('gid');
                var cmd = cmds[gid];
                if (cmd.status.code > 1) {
                    cmd.releaseGroup();
                }
            });
        });
    }

    addCommand(cmd) {
        var entry = createHistoryEntry(cmd);
        $('#history').append(entry);
        cmd.one(Command.WasReleasedEvent, function () {
            React.unmountComponentAtNode(entry);
            $(entry).remove();
        });
    }

}

export = HistoryWidget;
