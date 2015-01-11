// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func echoCmd(args ...string) *cmd {
	path := os.Getenv("ECHOBIN")
	if path == "" {
		path = "echo"
	}
	// TODO what's the deal with these explicit IDs? I vaguely recall something
	// about pre-allocation, but Im not sure if it wasn't just laziness.
	return newcmdPanicOnError(0, exec.Command(path, args...))
}

func TestCommandOutput(t *testing.T) {
	// extra spaces and a 4-byte UTF-8 char (FO9F98AC)
	c := echoCmd("look,", "unicode   smiley:", "😬")
	var b bytes.Buffer
	c.Stdout().SetListener(&b)
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

// All writes will block, until .UnlockWrites is called once, after which all
// writes will be passed to the internal Buffer straight away. The
// FirstWriteReceived waitgroup is locked until Write is called for the first
// time.
type blockedWriter struct {
	firstWriteReceivedWG sync.WaitGroup
	// you know, the thing is, I am so tired of Go, I just stopped trying. is
	// using a Once AND a WG the best solution? is this the best name? should
	// they be wrapped in a struct? I don't know, and I don't want to find out.
	// it really makes me sad, deep down inside, but I can't bring myself to
	// care. Go: I don't care about you, or code written using you, one,
	// single, bit.
	firstWriteReceivedOnce sync.Once
	writeLock              sync.WaitGroup
	bytes.Buffer
}

func newBlockedWriter() *blockedWriter {
	var l blockedWriter
	l.writeLock.Add(1)
	l.firstWriteReceivedWG.Add(1)
	return &l
}

func (l *blockedWriter) Write(data []byte) (int, error) {
	l.firstWriteReceivedOnce.Do(func() {
		l.firstWriteReceivedWG.Done()
	})
	l.writeLock.Wait()
	return l.Buffer.Write(data)
}

// call once to unlock all future writes
func (l *blockedWriter) UnlockWrites() {
	l.writeLock.Done()
}

// I'm talking but nobody's listening!
func TestCommandBlockedOutput(t *testing.T) {
	var err error
	var allGoRoutines sync.WaitGroup
	hraban := echoCmd("bla", "bla", "bla")
	l := newBlockedWriter()
	hraban.Stdout().SetListener(l)
	err = hraban.Start()
	if err != nil {
		t.Fatalf("error starting echo command: %v", err)
	}
	var oneWhenDone int32 = 0
	allGoRoutines.Add(1)
	go func() {
		// writing should still be blocked
		l.firstWriteReceivedWG.Wait()
		time.Sleep(100 * time.Millisecond) // reduce chance of race
		// at this point I expect the main goroutine to have blocked on .Wait()
		if atomic.LoadInt32(&oneWhenDone) == 1 {
			t.Error("echo didn't block on writing to stdout")
		}
		l.UnlockWrites()
		allGoRoutines.Done()
	}()
	err = hraban.Wait()
	if err != nil {
		t.Errorf("Error running echo command: %v", err)
	}
	atomic.AddInt32(&oneWhenDone, 1)
	if l.Buffer.String() != "bla bla bla\n" {
		t.Errorf("expected %q, got %q", "bla bla bla\n", l.Buffer.String())
	}
	allGoRoutines.Wait()
}

func startAll(cmds ...*cmd) error {
	for i, c := range cmds {
		err := c.Start()
		if err != nil {
			return fmt.Errorf("error starting command %s (%d): %v", c.Name(), i, err)
		}
	}
	return nil
}

// Ahhh, yes. Go.
// Go, go, go, go, go.
func waitAll(cmds ...*cmd) error {
	for i, c := range cmds {
		err := c.Wait()
		if err != nil {
			return fmt.Errorf("error running command %s (%d): %v", c.Name(), i, err)
		}
	}
	return nil
}

func TestCommandPipe(t *testing.T) {
	LEN_PIPELINE := 10
	cmds := make([]*cmd, LEN_PIPELINE)
	// the > also verifies that exec.Command is not secretly passed through a
	// shell
	cmds[0] = echoCmd("batman", ">", "superman")
	for i := 1; i < LEN_PIPELINE; i++ {
		cmds[i] = newcmdPanicOnError(CmdId(i), exec.Command("cat"))
		cmds[i-1].Stdout().SetListener(cmds[i].Stdin())
	}
	var b bytes.Buffer
	var err error
	cmds[LEN_PIPELINE-1].Stdout().SetListener(&b)
	err = startAll(cmds...)
	if err != nil {
		t.Fatal(err)
	}
	err = waitAll(cmds...)
	if err != nil {
		t.Fatal(err)
	}
	if b.String() != "batman > superman\n" {
		t.Errorf("unexpected output from piped command: %q", b.String())
	}
}

// echo hello | nonexistingcmd
//
// https://github.com/hraban/lush/issues/43
func TestCommandDeadPipe(t *testing.T) {
	c1 := echoCmd("hello")
	c2 := newcmdPanicOnError(1, exec.Command("nonexistingcmd"))
	c1.Stdout().SetListener(c2.Stdin())
	var err error
	err = c1.Start()
	if err != nil {
		t.Fatalf("failed to start echo command: %v", err)
	}
	err = c2.Start()
	if err == nil {
		t.Fatalf("expected error starting non-existing command")
	}
	err = c1.Wait()
	if err == nil {
		// Actually, I'm getting mixed results here on different machines (even
		// across different runs on the same machine). This is because kernel
		// pipes are buffered. Disabling this test for now because I'm not sure
		// how to create a deterministically reproducible test case.
		// TODO: I'd still like to be able to connect two commands and inform
		// the writer about errors on the reader. I'm okay with them ocurring
		// on close(), e.g. Unfortunately using a copy of 'echo' that always
		// explicitly closes stdout on exit, and actually checks the result,
		// does not always cause an error either. I.e. with buffered pipes, you
		// really can't know.
		//t.Fatalf("expected error from piping echo to non-existent command")
	}
}

func TestCommandNotFound(t *testing.T) {
	var c *cmd
	var err error
	c = newcmdPanicOnError(0, exec.Command("cecinestpasuncommand"))
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
	c = newcmdPanicOnError(0, exec.Command("cecinestpasuncommand"))
	err = c.Run()
	if err == nil {
		t.Errorf("Expected error from nonexistent command .Run()")
	}
	err = c.Wait()
	if err == nil {
		t.Errorf("Expected error from nonexistent command .Wait()")
	}
}

func TestCommandIllegalAPIUse(t *testing.T) {
	c := echoCmd()
	err := c.Wait()
	if err == nil {
		t.Errorf("expected error calling .Wait() without .Start()")
	}
	// just a random signal
	err = c.Signal(os.Interrupt)
	if err == nil {
		t.Errorf("expected error sending signal before .Start()")
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
	// the other one.
	err = c.Signal(os.Kill)
	if err == nil {
		t.Errorf("expected error sending signal after .Wait()")
	}
}

func TestCommandCwd(t *testing.T) {
	// Don't test if it's not supported
	if !GETCMDWD_SUPPORTED {
		t.Skip("getCmdCwd not supported on this platform")
	}
	c := newcmdPanicOnError(0, exec.Command("sleep", "1"))
	err := c.Start()
	if err != nil {
		t.Fatalf("error starting command: %v", err)
	}
	// the actual test:
	testcwd, err := c.Cwd()
	if err != nil {
		t.Errorf("Getting working directory failed: %v", err)
	}
	err = c.Wait()
	if err != nil {
		t.Errorf("error running command: %v", err)
	}
	mycwd, err := os.Getwd()
	if err != nil {
		t.Fatal("Failed to get test process working directory:", err)
	}
	if testcwd != mycwd {
		t.Errorf("Command CWD (%q) not equal to test process CWD (%q)", testcwd,
			mycwd)
	}
}

// Matches output from pwd in UNIX (/) or Windows (C:\) root
var rootPathRegexp = regexp.MustCompile(`^([c-zC-Z]:\\|/)\n?$`)

func isRootPath(b []byte) bool {
	return rootPathRegexp.Match(b)
}

func TestCommandSetStartWd(t *testing.T) {
	var b bytes.Buffer
	c := newcmdPanicOnError(0, exec.Command("pwd"))
	c.SetStartWd("/")
	c.Stdout().SetListener(&b)
	err := c.Run()
	if err != nil {
		t.Fatalf("error running command: %v", err)
	}
	if !c.Status().Success() {
		t.Fatalf("unexpected status: %#v", c.Status())
	}
	if !isRootPath(b.Bytes()) {
		t.Errorf("unexpected directory: %q", b.String())
	}
}

func TestCommandStartWd(t *testing.T) {
	var b bytes.Buffer
	c := newcmdPanicOnError(0, exec.Command("pwd"))
	c.Stdout().SetListener(&b)
	// change directory of test process
	err := os.Chdir("/")
	if err != nil {
		t.Fatalf("Couldn't change directory of test process:", err)
	}
	err = c.Run()
	if err != nil {
		t.Fatalf("error running command: %v", err)
	}
	if !c.Status().Success() {
		t.Fatalf("unexpected status: %#v", c.Status())
	}
	if !isRootPath(b.Bytes()) {
		t.Errorf("unexpected directory: %q", b.String())
	}
	// see if StartWd picked up un our os.Chdir
	if !isRootPath([]byte(c.StartWd())) {
		t.Errorf("command start dir not in root: %q", c.StartWd())
	}
}
