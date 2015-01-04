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
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
)

type session struct {
	lastid      int64
	cmds        map[CmdId]*cmd
	environ     map[string]string
	environlock sync.RWMutex
}

func (s *session) newid() CmdId {
	return CmdId(atomic.AddInt64(&s.lastid, 1))
}

// Start a new command in this shell session. Returned object is not threadsafe
func (s *session) NewCommand(name string, arg ...string) Cmd {
	execcmd := &exec.Cmd{
		Args: append([]string{name}, arg...),
	}
	s.environlock.RLock()
	for k, v := range s.environ {
		execcmd.Env = append(execcmd.Env, k+"="+v)
	}
	s.environlock.RUnlock()
	c := newcmdPanicOnError(s.newid(), execcmd)
	s.cmds[c.id] = c
	return c
}

func (s *session) GetCommand(id CmdId) Cmd {
	c := s.cmds[id]
	if c == nil {
		return nil
	}
	return c
}

func (s *session) GetCommandIds() []CmdId {
	ids := make([]CmdId, len(s.cmds))
	i := 0
	for id := range s.cmds {
		ids[i] = id
		i++
	}
	return ids
}

func (s *session) ReleaseCommand(id CmdId) error {
	c := s.cmds[id]
	if c == nil {
		return fmt.Errorf("no such command: %d", id)
	}
	err := c.release()
	if err != nil {
		return err
	}
	delete(s.cmds, id)
	// are there some cyclic or pending references or can we trust the GC on
	// this one? I don't really feel like figuring that out right now so Ill
	// just mark it TODO.
	return nil
}

func (s *session) Chdir(dir string) error {
	// not session-local at all
	return os.Chdir(dir)
}

func (s *session) Setenv(key, value string) {
	s.environlock.Lock()
	defer s.environlock.Unlock()
	s.environ[key] = value
}

func (s *session) Unsetenv(key string) {
	s.environlock.Lock()
	defer s.environlock.Unlock()
	delete(s.environ, key)
}

func (s *session) Getenv(key string) string {
	s.environlock.RLock()
	defer s.environlock.RUnlock()
	return s.environ[key]
}

func (s *session) Environ() map[string]string {
	s.environlock.Lock()
	defer s.environlock.Unlock()
	envcopy := map[string]string{}
	for k, v := range s.environ {
		envcopy[k] = v
	}
	return envcopy
}

func NewSession() Session {
	env := map[string]string{}
	for _, x := range os.Environ() {
		tokens := strings.SplitN(x, "=", 2)
		env[tokens[0]] = tokens[1]
	}
	return &session{
		cmds:    map[CmdId]*cmd{},
		environ: env,
	}
}
