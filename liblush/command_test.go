// Copyright © 2014 Hraban Luyat <hraban@0brg.net>
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
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestCommandOutput(t *testing.T) {
	// extra spaces and a 4-byte UTF-8 char (FO9F98AC)
	execcmd := exec.Command("echo", "look,", "unicode   smiley:", "😬")
	c := newcmd(1, execcmd)
	var b bytes.Buffer
	c.Stdout().AddWriter(&b)
	err := c.Run()
	if err != nil {
		t.Fatalf("error running command: %v", err)
	}
	if !c.Status().Success() {
		t.Errorf("unexpected status: %#v", c.Status())
	}
	if b.String() != "look, unicode   smiley: 😬\n" {
		t.Errorf("unexpected output from command: %q", b.String())
	}
}

func TestCommandPipe(t *testing.T) {
	var LEN_PIPELINE int
	if testing.Short() {
		LEN_PIPELINE = 3
	} else {
		LEN_PIPELINE = 1000
	}
	cmds := make([]*cmd, LEN_PIPELINE)
	// the > also verifies that exec.Command is not secretly passed through a
	// shell
	cmds[0] = newcmd(0, exec.Command("echo", "batman", ">", "superman"))
	for i := 1; i < LEN_PIPELINE; i++ {
		cmds[i] = newcmd(CmdId(i), exec.Command("cat"))
		cmds[i-1].Stdout().AddWriter(cmds[i].Stdin())
	}
	var b bytes.Buffer
	cmds[LEN_PIPELINE-1].Stdout().AddWriter(&b)
	for i, c := range cmds {
		err := c.Start()
		if err != nil {
			t.Fatalf("error starting command %s (%d): %v", c.Name(), i, err)
		}
	}
	for i, c := range cmds {
		err := c.Wait()
		if err != nil {
			t.Fatalf("error running command %s (%d): %v", c.Name(), i, err)
		}
	}
	if b.String() != "batman > superman\n" {
		t.Errorf("unexpected output from piped command: %q", b.String())
	}
}

func TestCommandNotFound(t *testing.T) {
	var c *cmd
	var err error
	c = newcmd(0, exec.Command("cecinestpasuncommand"))
	err = c.Start()
	if err == nil {
		t.Errorf("Expected error from starting nonexistent command")
	}
	if c.Status().Started() != nil {
		t.Errorf("non-existent command cannot have a start time")
	}
	if c.Status().Err() == nil {
		t.Errorf("starting non-existent command must set status to error")
	}
	c = newcmd(0, exec.Command("cecinestpasuncommand"))
	err = c.Run()
	if err == nil {
		t.Errorf("Expected error from nonexistent command .Run()")
	}
}

func TestCommandIllegalAPIUse(t *testing.T) {
	c := newcmd(0, exec.Command("echo"))
	err := c.Wait()
	if err == nil {
		t.Errorf("expected error calling .Wait() without .Start()")
	}
	err = c.Signal(os.Interrupt)
	if err == nil {
		t.Errorf("expected error sending SIGINT before .Start()")
	}
	err = c.Start()
	if err != nil {
		t.Errorf("unexpected error starting echo command: %v", err)
	}
	err = c.SetArgv(strings.Split("echo mosterd na de maaltijd", " "))
	if err == nil {
		t.Errorf("expected error calling .SetArgv() after .Start()")
	}
	err = c.Start()
	if err == nil {
		t.Errorf("expected error calling .Start() twice")
	}
	err = c.Wait()
	if err != nil {
		t.Errorf("unexpected error running echo command: %v", err)
	}
	err = c.Signal(os.Kill)
	if err == nil {
		t.Errorf("expected error sending SIGKILL after .Wait()")
	}
}
