// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
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

package liblush

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

type cmdstatus struct {
	started *time.Time
	exited  *time.Time
	err     error
}

// command life-time phases
const (
	preparation = iota
	running
	done
)

func (s cmdstatus) Started() *time.Time {
	return s.started
}

func (s cmdstatus) Exited() *time.Time {
	return s.exited
}

func (s cmdstatus) Success() bool {
	return s.err == nil
}

func (s cmdstatus) Err() error {
	return s.err
}

// Guaranteed to be unique for every command at one specific point in time but
// once a command is cleaned up another may reuse his id.
type CmdId int64

func ParseCmdId(idstr string) (CmdId, error) {
	var i int64
	_, err := fmt.Sscan(idstr, &i)
	return CmdId(i), err
}

type cmd struct {
	id      CmdId
	execCmd *exec.Cmd
	status  cmdstatus
	// Released when command finishes
	done   sync.WaitGroup
	stdout *richpipe
	stderr *richpipe
	stdin  InStream
}

func (c *cmd) Id() CmdId {
	return c.id
}

func (c *cmd) Name() string {
	return c.execCmd.Path
}

func (c *cmd) Argv() []string {
	return c.execCmd.Args
}

func (c *cmd) Run() error {
	startt := time.Now()
	c.status.started = &startt
	// If not set explicitly bind stdin to a system pipe. This allows the
	// spawned process to close it without reading if it is not needed.
	if c.stdin == nil {
		pw, err := c.execCmd.StdinPipe()
		if err != nil {
			return err
		}
		c.stdin = newLightPipe(c, pw)
	}
	c.status.err = c.execCmd.Run()
	c.stdout.Close()
	c.stderr.Close()
	exitt := time.Now()
	c.status.exited = &exitt
	c.done.Done()
	return c.status.err
}

func (c *cmd) Start() error {
	if c.status.started != nil {
		return errors.New("command already started")
	}
	go c.Run()
	return nil
}

func (c *cmd) Wait() error {
	c.done.Wait()
	return c.status.err
}

func (c *cmd) Stdin() InStream {
	if c.stdin == nil {
		pr, pw := io.Pipe()
		c.stdin = newLightPipe(c, pw)
		c.execCmd.Stdin = pr
	}
	return c.stdin
}

func (c *cmd) Stdout() OutStream {
	return c.stdout
}

func (c *cmd) Stderr() OutStream {
	return c.stderr
}

func (c *cmd) Status() CmdStatus {
	return c.status
}

// Create new ringbuffer and copy the old data over. Not a pretty nor an
// efficient implementation but it gets the job done.
func resize(r ringbuf, i int) ringbuf {
	r2 := newRingbuf(i)
	buf := make([]byte, r.Size())
	// Useful bytes
	n := r2.Last(buf)
	buf = buf[:n]
	r2.Write(buf)
	return r2
}

type devnull struct{}

func (d devnull) Write(data []byte) (int, error) {
	return len(data), nil
}

func (d devnull) Close() error {
	return nil
}

// stdout and stderr data is discarded by default, call Stdout/err().SetPipe()
// to save
func newcmd(id CmdId, execcmd *exec.Cmd) *cmd {
	c := &cmd{
		id:      id,
		execCmd: execcmd,
		stdout:  newRichPipe(1000),
		stderr:  newRichPipe(1000),
	}
	c.stdout.SetPipe(devnull{})
	c.stderr.SetPipe(devnull{})
	c.execCmd.Stdout = c.stdout
	c.execCmd.Stderr = c.stderr
	return c
}
