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

var $ = require("jquery");
var React = require("react");

var Command = require("./Command");
var U = require("./utils");
 
 
 
 

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

    var StatusNode = React.createClass({
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
                content = React.createElement(StopButton, {
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
                    React.createElement(StatusNode, {cmd: this.props.cmd}))
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
            this.state.off = this.props.cmd.onany(events, this.props.onChange);
        },

        componentWillUnmount: function () {
            this.state.off();
            delete this.state.off;
        },

        render: function () {
            var myProps = this.props;
            var cmd = myProps.cmd;
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
                    React.createElement(CommandWidget, {cmd: cmd}),
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
            if (!this.props.cmd.isRoot()) {
                return null;
            }
            var myProps = {
                id: "root" + this.props.cmd.nid,
                className: React.addons.classSet({
                    rootcontainer: true,
                    archived: this.props.cmd.userdata.archived,
                })
            };
            var component = this;
            var childProps = {
                cmd: this.props.cmd,
                // for some reason calling .render() doesn't do anything. I
                // don't understand react and I also don't care. bite me.
                onChange: function () {
                    component.setProps({cmd: component.props.cmd});
                },
                key: this.props.cmd.htmlid
            }
            return (
                React.DOM.div(myProps,
                    React.createElement(WindowButtons, {cmd: this.props.cmd}),
                    React.createElement(GroupWidget, childProps))
            );
        }
    });

    // create root widget for this command
    function createWidget(cmd, cmds) {
        var wrapper = document.createElement('div');
        cmds.appendChild(wrapper);
        var props = {cmd: cmd, key: 'root' + cmd.nid};
        var reactel = React.createElement(RootContainer, props);
        var component = React.render(reactel, wrapper, function () {
            // new widget causes bottom of widgets div to scroll away:
            U.scrollToBottom(cmds);
        });
        cmd.one(Command.WasReleasedEvent, function () {
            React.unmountComponentAtNode(wrapper);
            cmds.removeChild(wrapper);
        });
        return wrapper;
    }

module.exports = createWidget;
