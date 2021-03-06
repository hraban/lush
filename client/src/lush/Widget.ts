// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// The View for command objects: small widgets in the "command columns"
//
// Every command widget is wrapped in a group widget. Within that group widget
// resides:
//
// - the command widget
// - the group widget of every child of the command (indirectly)
//
// eg "echo hahahajustkidding | tee /tmp/foo | mail -s 'I think you are great' root"
//
// cmd ids: echo=1, tee=2, mail=3
//
// then this is your view tree:
//
// (groupwidget1
//   (cmdwidget1)
//   (children
//     (groupwidget2
//       (cmdwidget2)
//       (children
//         (groupwidget3
//           (cmdwidget3))))))
//
// all this is wrapped in a <div class=rootcontainer>

/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/react-0.13.0.d.ts" />

import * as $ from "jquery";
import * as React from "react/addons";

import * as Command from "./Command";
import * as U from "./utils";
 
var StopButton = React.createClass({
    getInitialState: function () {
        return { disabled: false };
    },

    render: function () {
        var props = {
            className: "stop",
            disabled: this.state.disabled
        };
        return React.DOM.button(props, "◼");
    },
    
    componentDidMount: function () {
        var component = this;
        // Cannot be registered as onClick property on the button
        // reactelement because that requires the event to bubble up all the
        // way to the top. It will be catched mid-way by non-react code (for
        // selecting the active command in main.js) and that will cancel
        // event propagation (rightfully so), triggering a wrong event
        // handler and negating the correct one.
        this.getDOMNode().onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            // prevent double clicking by disabling for a second
            component.setState({disabled: true});
            setTimeout(function () {
                if (component.isMounted()) {
                    component.setState({disabled: false});
                }
            }, 1000);
            // Actual handling of click
            component.props.handleClick();
        };
    }
});

// TODO: Learn about react mixins (or something)
var StatusNode = React.createClass(<any>{
    stopCommand: function () {
        this.props.cmd.stop();
    },

    render: function () {
        var content;
        switch (this.props.cmd.status.code) {
        case 0:
            content = undefined;
            break;
        case 1:
            // TODO: Learn about react mixins (or something)
            content = React.createElement(StopButton, <any>{
                key: "StopButton" + this.props.cmd.nid,
                handleClick: this.stopCommand,
            });
            break
        case 2:
            content = "✓";
            break;
        case 3:
            content = "✗";
            break;
        default:
            throw new Error("illegal status code");
        }
        return React.DOM.span({className: "status"}, content);
    }
});

var CommandWidget = React.createClass({
    render: function () {
        var argvtxt = this.props.cmd.getArgv().join(" ");
        return (
            React.DOM.div({id: this.props.cmd.htmlid,
                                        className: "cmdwidget"},
                this.props.cmd.nid + ":",
                React.createElement("tt", null, argvtxt),
                // TODO: React mixins (or something)
                React.createElement(StatusNode, <any>{cmd: this.props.cmd}))
        );
    }
});

var GroupWidget = React.createClass({
    getInitialState: function () {
        return {};
    },

    propTypes: {
        parentStreamName: React.PropTypes.string,
        onChange: React.PropTypes.func.isRequired,
        cmd: function (props, propName, componentName) {
            if (!(props[propName] instanceof Command.Command)) {
                return new Error("cmd property should be a Command");
            }
        }
    },

    componentWillMount: function () {
        var events = [
            Command.ArchivalEvent,
            Command.ChildAddedEvent,
            Command.ChildRemovedEvent,
            Command.ParentAddedEvent,
            Command.ParentRemovedEvent,
            Command.UpdatedArgsEvent,
            Command.UpdatedCmdEvent,
            Command.UpdatedStatusEvent
        ];
        var that = this;
        this.state.off = this.props.cmd.onany(events, function () {
            that.props.onChange();
        });
        this.props.cmd.one(Command.WasReleasedEvent, function (e: Command.WasReleasedEvent) {
            that.state.off = null;
        });
    },

    componentWillUnmount: function () {
        this.state.off && this.state.off();
        delete this.state.off;
    },

    render: function () {
        var myProps = this.props;
        var cmd: Command.Command = myProps.cmd;
        var children = [];
        function addChild(cmd, parentStreamName) {
            if (typeof parentStreamName !== "string") {
                throw new TypeError("expected parent stream name (string)");
            }
            var childProps = {
                parentStreamName: parentStreamName,
                cmd: cmd,
                key: cmd.htmlid,
                onChange: myProps.onChange
            }
            children.push(React.createElement(GroupWidget, childProps));
        }
        if (cmd.stdoutto) {
            addChild(cmd.stdoutCmd(), "stdout");
        }
        if (cmd.stderrto) {
            addChild(cmd.stderrCmd(), "stderr");
        }
        var divProps = {
            id: "group" + cmd.nid,
            className: "groupwidget",
            // Undefined if undefined :] (stupid vim syntax highlighter)
            "data-parent-stream": myProps.parentStreamName,
        };
        return (
            React.DOM.div(divProps,
                // TODO: React mixins (or something)
                React.createElement(CommandWidget, <any>{cmd: cmd}),
                React.DOM.div({className: "children"}, children))
        );
    }
});

var WindowButtons = React.createClass({
    render: function () {
        return (
            React.DOM.div({className: "windowbuttons"},
                React.DOM.button({className: "repeatgroup"}, "↻"),
                React.DOM.button({className: "startgroup"}, "▶"),
                React.DOM.button({className: "archivegroup"}, "_"),
                React.DOM.button({className: "releasegroup"}, "x"))
        );
    }
});

var RootContainer = React.createClass({
    render: function () {
        var cmd: Command.Command = this.props.cmd;
        if (!cmd.isRoot()) {
            return null;
        }
        var myProps = {
            id: "root" + this.props.cmd.nid,
            className: React.addons.classSet({
                rootcontainer: true,
                archived: cmd.userdata.archived,
            })
        };
        var that = this;
        var childProps = {
            cmd: cmd,
            // for some reason calling .render() doesn't do anything. I
            // don't understand react and I also don't care. bite me.
            onChange: function () {
                that.setProps({cmd: cmd});
            },
            key: cmd.htmlid
        }
        return (
            React.DOM.div(myProps,
                // TODO: React mixins (or something)
                React.createElement(WindowButtons, <any>{cmd: cmd}),
                React.createElement(GroupWidget, childProps))
        );
    }
});

// create root widget for this command
export default function createWidget(cmd: Command.Command, container: HTMLElement) {
    var wrapper = document.createElement('div');
    container.appendChild(wrapper);
    var props = {cmd: cmd, key: 'root' + cmd.nid};
    var reactel = React.createElement(RootContainer, props);
    var component = React.render(reactel, wrapper, function () {
        // new widget causes bottom of widgets div to scroll away:
        U.scrollToBottom(container);
    });
    cmd.one(Command.WasReleasedEvent, function () {
        React.unmountComponentAtNode(wrapper);
        container.removeChild(wrapper);
    });
    return wrapper;
}
