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

// Library functions and definitions for lush
package liblush

// This file defines only the interfaces

import (
	"io"
	"os"
	"time"
)

type CmdStatus interface {
	// Time the command was started or nil if not started yet
	Started() *time.Time
	// When the command stopped, nil if still running / not started
	Exited() *time.Time
	Success() bool
	// nil iff Success() == true
	Err() error
	// Called with this status as an argument on every update. If the callback
	// returns a non-nil error it will not be called for future updates.
	NotifyChange(func(CmdStatus) error)
}

// Circular fifo buffer.
type Ringbuffer interface {
	Size() int
	Resize(int)
	// Fill this buffer with the most recently written bytes.  Not implemented
	// as io.Reader because that is intended for streams, i.e.  advancing some
	// internal seek counter, i.e. state. This Last() method is very explicitly
	// read-only; it does not modify any internal state.  Calling it twice on
	// an unmodified buffer will yield the same result.  Read will not.
	Last(p []byte) int
	Write(data []byte) (int, error)
	// Write the entire contents to this io.Writer
	WriteTo(w io.Writer) (int64, error)
}

// Output stream of a command
type OutStream interface {
	// Send all output to this writer. Multiple writers can be hooked up and
	// unloaded at any time. If this writer's Write returns an error it is
	// removed from the list without affecting anything else.  Output is
	// blocked if no writers are configured.
	AddWriter(w io.Writer)
	// Remove a writer previously set with AddWriter. Returns false if not set.
	RemoveWriter(w io.Writer) bool
	Writers() []io.Writer
	Scrollback() Ringbuffer
}

// Input stream of a command.  Writes to this stream block until the command is
// started and fail if it has exited
type InStream interface {
	io.WriteCloser
	// Command this stream belongs to (never nil)
	Cmd() Cmd
}

// A shell command state similar to os/exec.Cmd
type Cmd interface {
	Id() CmdId
	// if SetName has been called return that otherwise best effort
	Name() string
	SetName(string)
	Argv() []string
	// Error to call this after command has started
	SetArgv([]string) error
	// Run command and wait for it to exit
	Run() error
	// Start the command in the background. Follow by Wait() to get exit status
	Start() error
	// Block until command is complete return exit status
	Wait() error
	Stdin() InStream
	Stdout() OutStream
	Stderr() OutStream
	Status() CmdStatus
	// Opaque data, untouched by the shell
	UserData() interface{}
	SetUserData(interface{})
	Signal(os.Signal) error
}

type Session interface {
	Chdir(dir string) error
	NewCommand(name string, arg ...string) Cmd
	GetCommand(id CmdId) Cmd
	GetCommandIds() []CmdId
	ReleaseCommand(id CmdId) error
	// Environment that will be passed to child processes. NOT the environment
	// variables of this shell process. Eg setting Path will not affect where
	// this session looks for binaries. It will, however, affect how child
	// processes search for binaries because they will actually have the
	// modified PATH as an envvar.
	Setenv(key, value string)
	Unsetenv(key string)
	Getenv(name string) string
	Environ() map[string]string
}
