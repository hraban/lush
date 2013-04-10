var stat2html = function(nid, stat) {
    switch(stat) {
    case 0:
        return '<form method=post action="/' + nid + '/start" class="start-cmd"> <button>start</button> </form>';
    case 1:
        return '⌚';
    case 2:
        return '✓';
    case 3:
        return '✗';
    }
};

var storeposition = function(id, pos) {
    localStorage.setItem(id + '.left', '' + pos.left);
    localStorage.setItem(id + '.top', '' + pos.top);
};

var getposition = function(id) {
    var left = localStorage.getItem(id + '.left');
    var top = localStorage.getItem(id + '.top');
    if (left === null || top === null) {
        return null;
    }
    return {left: +left, top: +top};
};

var restoreposition = function(id) {
    var pos = getposition(id);
    if (pos !== null) {
        $('#' + id).offset(pos);
    }
};

var streampeekerId = 0;

// Stream peeker is like a small dumb terminal window showing a stream's most
// recent output
var addstreampeeker = function() {
    var id = 'streampeeker' + (streampeekerId++);
    var $sp = $('<div class=streampeeker id=' + id + '>')
        .resizable()
        .appendTo('body');
    // open / collapse button
    var $ocbutton = $('<button>');
    // functions that open / collapse the streampeeker
    var openf, collapsef;
    openf = function() {
        $sp.removeClass('collapsed');
        $sp.addClass('open');
        $ocbutton.text('▬');
        $ocbutton.unbind('click', openf);
        $ocbutton.bind('click', collapsef);
        $sp.resizable({
            resize: function(e, ui) {
                jsPlumb.repaint(ui.helper);
            }})
        jsPlumb.repaint($sp);
    };
    collapsef = function() {
        $sp.removeClass('open');
        $sp.addClass('collapsed');
        $ocbutton.text('◳');
        $ocbutton.unbind('click', collapsef);
        $ocbutton.bind('click', openf);
        $sp.resizable('destroy');
        jsPlumb.repaint($sp);
    };
    collapsef();
    jsPlumb.draggable($sp);
    $sp.append($ocbutton);
    var left = jsPlumb.addEndpoint(id, {
        anchor: 'TopCenter',
        isTarget: true,
        endpoint: 'Rectangle',
    });
    jsPlumb.addEndpoint(id, {
        anchor: 'BottomCenter',
        isSource: true,
        endpoint: 'Rectangle',
    });
    return $sp;
};

var stream2anchor = function(stream) {
    return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
};

var anchor2stream = function(anchor) {
    return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
};

var connectVisually = function($src, $trgt, stream, withstreampeeker) {
    var anchor = stream2anchor(stream);
    if (withstreampeeker) {
        var $sp = addstreampeeker();
        jsPlumb.connect({
            source: $src,
            target: $sp,
            anchors: [anchor, "TopCenter"],
        });
        $src = $sp;
        anchor = "BottomCenter";
    }
    jsPlumb.connect({
        source: $src,
        target: $trgt,
        anchors: [anchor, "TopCenter"],
    });
};

var connect = function(srcSysId, trgtSysId, stream) {
    $.post('/' + srcSysId + '/connect?noredirect', {
        stream: stream,
        to: trgtSysId,
    }).done(function() {
        connectVisually('cmd' + srcSysId, 'cmd' + trgtSysId, stream, true);
    });
};

// analogous to CL's function by the same name
var constantly = function(val) {
    return function() { return val; }
};

$(document).ready(function() {
    $.map(cmds, function(cmd, i) {
        var $node = $(
            '<div class="cmd" id="' + cmd.htmlid + '">' +
            '<a href="/' + cmd.nid + '/">' + cmd.nid + ': ' +
            '<tt>' + cmd.argv.join(" ") + '</tt></a> ' +
            stat2html(cmd.nid, cmd.status) + '</p>');
        $('#cmds').append($node);
        restoreposition(cmd.htmlid);
        $node.resizable({
            resize: function(e, ui) {
                jsPlumb.repaint(ui.helper);
            }});
        jsPlumb.draggable($node, {
            stop: function(e, ui) {
                storeposition(this.id, ui.offset);
            }});
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'TopCenter',
            isTarget: true,
            parameters: {
                sysid: constantly(cmd.nid),
            },
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'BottomCenter',
            isSource: true,
            parameters: {
                stream: constantly("stdout"),
                sysid: constantly(cmd.nid),
            },
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'RightMiddle',
            isSource: true,
            parameters: {
                stream: constantly("stderr"),
                sysid: constantly(cmd.nid),
            },
        });
    });
    // Second iteration to ensure that connections are only made after all
    // nodes have configured endpoints
    $.map(cmds, function(cmd, i) {
        if (cmd.hasOwnProperty('stdoutto')) {
            connectVisually(cmd.htmlid, 'cmd' + cmd.stdoutto, 'stdout', false);
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.htmlid, 'cmd' + cmd.stderrto, 'stderr', false);
        }
    });
    jsPlumb.importDefaults({ConnectionsDetachable: false});
    jsPlumb.bind("beforeDrop", function(info) {
        // Connected to another command
        connect(
            info.connection.endpoints[0].getParameter("sysid")(),
            info.dropEndpoint.getParameter("sysid")(),
            info.connection.getParameter("stream")());
        return false;
    });
    // ajaxify start command button
    $('form.start-cmd').submit(function(e) {
        $.post(e.target.action + "?noredirect", $(this).serialize())
        .done(function() {
            $(e.target).html('⌚');
        }).fail(function() {
            $(e.target).html('✗');
        });
        return false;
    });
    // Auto complete
    $('form[action="/new"] input[name="name"]').autocomplete({source: "/new/names.json"});
});
