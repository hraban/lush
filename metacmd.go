// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"bytes"
	"fmt"
	"io"

	"github.com/hraban/lush/liblush"
)

// wrapper type for custom extensions of a Cmd object
type metacmd struct{ liblush.Cmd }

type statusJson struct {
	Code   int    `json:"code"`
	ErrStr string `json:"err"`
}

type cmdmetadata struct {
	Id               liblush.CmdId `json:"nid"`
	HtmlId           string        `json:"htmlid"`
	Name             string        `json:"name"`
	Cmd              string        `json:"cmd"`
	Args             []string      `json:"args"`
	Cwd              string        `json:"cwd"`
	StartWd          string        `json:"startwd"`
	Status           statusJson    `json:"status"`
	StdouttoId       liblush.CmdId `json:"stdoutto,omitempty"`
	StderrtoId       liblush.CmdId `json:"stderrto,omitempty"`
	StdoutScrollback int           `json:"stdoutScrollback"`
	StderrScrollback int           `json:"stderrScrollback"`
	UserData         interface{}   `json:"userdata"`
	Stdout           string        `json:"stdout"`
	Stderr           string        `json:"stderr"`
}

// if this writer is the instream of a command return that
func iscmd(w io.Writer) liblush.Cmd {
	if ins, ok := w.(liblush.InStream); ok {
		return ins.Cmd()
	}
	return nil
}

// return command that this stream pipes to, if any
func pipedcmd(outs liblush.OutStream) liblush.Cmd {
	return iscmd(outs.GetListener())
}

func cmdstatus2int(s liblush.CmdStatus) (i int) {
	// not very pretty then again this entire integer status thing is bollocks
	// anyway might as well abuse it all the way
	if s.Err() != nil {
		return 3
	}
	if s.Exited() == nil {
		if s.Started() == nil {
			i = 0
		} else {
			i = 1
		}
	} else {
		if s.Success() {
			i = 2
		} else {
			i = 3
		}
	}
	return
}

func cmdstatus2json(s liblush.CmdStatus) (sjson statusJson) {
	sjson.Code = cmdstatus2int(s)
	if err := s.Err(); err != nil {
		sjson.ErrStr = err.Error()
	}
	return
}

func stringifyWriterTo(w io.WriterTo) (string, error) {
	var buf bytes.Buffer
	_, err := w.WriteTo(&buf)
	if err != nil {
		return "", err
	}
	return buf.String(), nil
}

func (mc metacmd) Metadata() (data cmdmetadata, err error) {
	data.Id = mc.Id()
	data.HtmlId = fmt.Sprint("cmd", mc.Id())
	data.Name = mc.Name()
	if argv := mc.Argv(); len(argv) > 0 {
		data.Cmd = argv[0]
		data.Args = argv[1:]
	}
	data.Cwd, err = mc.Cwd()
	if err != nil {
		data.Cwd = fmt.Sprintf("<%v>", err)
	}
	data.StartWd = mc.StartWd()
	data.UserData = mc.UserData()
	data.StdoutScrollback = mc.Stdout().Scrollback().Size()
	data.StderrScrollback = mc.Stderr().Scrollback().Size()
	if cmd := pipedcmd(mc.Stdout()); cmd != nil {
		data.StdouttoId = cmd.Id()
	}
	if cmd := pipedcmd(mc.Stderr()); cmd != nil {
		data.StderrtoId = cmd.Id()
	}
	data.Status = cmdstatus2json(mc.Status())
	data.Stdout, err = stringifyWriterTo(mc.Stdout().Scrollback())
	if err != nil {
		err = fmt.Errorf("failed to retrieve stdout scrollback for %d: %v",
			mc.Id(), err)
		return
	}
	data.Stderr, err = stringifyWriterTo(mc.Stderr().Scrollback())
	if err != nil {
		err = fmt.Errorf("failed to retrieve stderr scrollback for %d: %v",
			mc.Id(), err)
		return
	}
	return
}
