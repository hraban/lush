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

define(["jquery",
        "react",
        "lush/Command",
        "lush/utils"],
       function ($, React, Command, U) {

    // disable this dom element a specified amount of time (prevent double
    // click)
    function disableAWhile(el, ms) {
        if (ms === undefined) {
            ms = 1000;
        }
        $(el).prop("disabled", true);
        setTimeout(function () {
            $(el).prop("disabled", false);
        }, ms);
    }

    var StatusNode = React.createClass({
        render: function () {
            var content;
            switch (this.props.cmd.status.code) {
            case 0:
                content = undefined;
                break;
            case 1:
                // TODO: button.onclick:
                //e.preventDefault();
                //disableAWhile(this);
                //cmd.stop();
                content = React.DOM.button({className: "stop"}, "◼");
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
        propTypes: {
            parentStreamName: React.PropTypes.string,
            onChange: React.PropTypes.func.isRequired,
            cmd: function (props, propName, componentName) {
                if (!(props[propName] instanceof Command)) {
                    return new Error("cmd property should be a Command");
                }
            }
        },

        componentWillMount: function () {
            var events = [
                'updated.status',
                'archival',
                'updated.cmd',
                'updated.args',
                'parentAdded',
                'parentRemoved',
                'childAdded',
                'childRemoved'
            ].reduce(function (x, y) { return x + y + '.WidgetGroupWidget '; }, '');
            $(this.props.cmd).on(events, this.props.onChange);
        },

        componentWillUnmount: function () {
            $(this.props.cmd).off('.WidgetGroupWidget');
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
    return function (cmd, cmds) {
        var wrapper = document.createElement('div');
        cmds.appendChild(wrapper);
        var props = {cmd: cmd, key: 'root' + cmd.nid};
        var reactel = React.createElement(RootContainer, props);
        var component = React.render(reactel, wrapper, function () {
            // new widget causes bottom of widgets div to scroll away:
            U.scrollToBottom(cmds);
        });
        $(cmd).one("wasreleased", function () {
            React.unmountComponentAtNode(wrapper);
            cmds.removeChild(wrapper);
        });
        return wrapper;
    };

});
