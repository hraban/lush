// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
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
	"log"
	"os"
	"os/exec"
	"sync"
)

// command life-time phases
const (
	preparation = iota
	running
	done
)

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
	name   string
	user   interface{}
}

func (c *cmd) Id() CmdId {
	return c.id
}

func (c *cmd) Name() string {
	return c.name
}

func (c *cmd) SetName(name string) {
	c.name = name
}

func (c *cmd) Argv() []string {
	// copy
	return append([]string{}, c.execCmd.Args...)
}

func (c *cmd) SetArgv(argv []string) error {
	if c.status.started != nil {
		return errors.New("cannot change arguments after command has started")
	}
	if len(argv) == 0 {
		return errors.New("empty argv list")
	}
	c.execCmd.Args = argv
	return nil
}

func (c *cmd) Cwd() (string, error) {
	// This looks racey but it's actually just a courtesy: if by race this test
	// doesn't trigger but the command stops just after it, no problem; you'll
	// just get a more obscure error message.
	if !isRunning(c) {
		return "", errors.New("command not running")
	}
	return getCmdWd(c)
}

func (c *cmd) StartWd() string {
	return c.execCmd.Dir
}

func (c *cmd) SetStartWd(dir string) {
	// you know what? I don't care if you call this after it started. suit
	// yourself.
	c.execCmd.Dir = dir
}

func (c *cmd) Run() error {
	var err error
	err = c.Start()
	if err != nil {
		return err
	}
	return c.Wait()
}

func (c *cmd) Start() error {
	var err error
	if wasStarted(c) {
		return errors.New("command has already been started")
	}
	// Lookup the executable
	p, err := exec.LookPath(c.execCmd.Args[0])
	if err != nil {
		p = c.execCmd.Args[0]
	}
	c.execCmd.Path = p
	if c.StartWd() == "" {
		// No explicit starting dir: starting dir of shell process
		cwd, err := os.Getwd()
		if err != nil {
			log.Print("Failed to obtain working directory of shell")
		} else {
			c.SetStartWd(cwd)
		}
	}
	err = c.execCmd.Start()
	if err != nil {
		c.status.setErr(err)
		return err
	}
	c.status.startNow()
	// TODO: cute, but needs some unit tests.
	// also, schizos are always pair programming :D
	// ... or D:
	go func() {
		err := c.execCmd.Wait()
		c.status.setErr(err)
		c.stdout.Close()
		c.stderr.Close()
		c.status.exitNow()
		c.done.Done()
	}()
	return nil
}

func (c *cmd) Wait() error {
	if c.status.started == nil {
		return errors.New("must start command before calling Wait()")
	}
	c.done.Wait()
	return c.status.err
}

func (c *cmd) Stdin() InStream {
	return c.stdin
}

func (c *cmd) Stdout() OutStream {
	return c.stdout
}

func (c *cmd) Stderr() OutStream {
	return c.stderr
}

func (c *cmd) Status() CmdStatus {
	return &c.status
}

func (c *cmd) UserData() interface{} {
	return c.user
}

func (c *cmd) SetUserData(data interface{}) {
	c.user = data
}

// WARNING: CODE SMELL. all code using this function is almost certainly
// race sensitive.
// TODO: refactor that code and remove this function
func isRunning(c *cmd) bool {
	return c.status.started != nil && c.status.exited == nil
}

// TODO: see isRunning about race &c
func wasStarted(c *cmd) bool {
	return c.status.started != nil || c.status.err != nil
}

func (c *cmd) Signal(sig os.Signal) error {
	// race race race
	if !isRunning(c) {
		return errors.New("can only send signal to running command")
	}
	return c.execCmd.Process.Signal(sig)
}

// free all resources associated with this command. error if command is
// running.
func (c *cmd) release() error {
	// haha so how about them race conditions eh?
	if isRunning(c) {
		return errors.New("cannot free running command")
	}
	var firsterr error
	// set the firsterror to this one if not already set
	recerr := func(e error) {
		if firsterr == nil {
			firsterr = e
		}
	}
	if c.execCmd.Process != nil {
		recerr(c.execCmd.Process.Release())
	}
	for _, cl := range []io.Closer{c.stdin, c.stdout, c.stderr} {
		if cl != nil {
			recerr(cl.Close())
		}
	}
	return nil
}

type devnull int

// io.ReadWriteCloser that discards all incoming data and never fails
const Devnull devnull = 0

func (d devnull) Read(p []byte) (int, error) {
	return 0, io.EOF
}

func (d devnull) Write(data []byte) (int, error) {
	return len(data), nil
}

func (d devnull) Close() error {
	return nil
}

// stdout and stderr data is discarded by default, call Stdout/err().SetPipe()
// to save
func newcmd(id CmdId, execCmd *exec.Cmd) (*cmd, error) {
	pw, err := execCmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %v", err)
	}
	c := &cmd{
		id:      id,
		execCmd: execCmd,
		stdout:  newRichPipe(Devnull, 1000),
		stderr:  newRichPipe(Devnull, 1000),
	}
	// by doing this here it is guaranteed you can start writing to a new
	// command's stdin, even before it is started.
	c.stdin = newLightPipe(c, pw)
	c.execCmd.Stdout = c.stdout
	c.execCmd.Stderr = c.stderr
	c.name = c.execCmd.Path
	c.done.Add(1)
	return c, nil
}

// sorry man I just really don't wanna include error checking in all places
// that call newcmd right now. this is an easier find & replace. besides, what
// are the odds os.Pipe fails, these days, anyway? and do you really wanna live
// in a world like that?
// no, seriously; TODO.
func newcmdPanicOnError(id CmdId, execCmd *exec.Cmd) *cmd {
	c, err := newcmd(id, execCmd)
	if err != nil {
		panic(err.Error())
	}
	return c
}
