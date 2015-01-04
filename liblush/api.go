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
	// An output stream has one main listener it forwards all its data to. If
	// none is set, all output the command tries to write to this stream will
	// cause an error. Yes sir it will. When the command writes data this
	// OutStream will call the main listener's Write method and wait for that
	// to complete.  Does Write return an error? Then that error will be
	// returned back to the command, nothing else; the listener is kept around.
	SetListener(io.Writer)
	// Return what was passed as an argument to the last call of SetListener
	// (nil if none)
	GetListener() io.Writer
	// A peeker is like the main listener, except that it's a
	// FlexibleMultiWriter, so:
	//
	//     * errors writing to a peeker cause the peeker to be unloaded and are
	//       not propagated back up
	//     * you can register more than one peeker
	//
	// One common point with the main listener: a peeker that hangs on its
	// .Write method will cause the entire stream to hang. You might want
	// something different, but that's life.
	Peeker() *FlexibleMultiWriter
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
	// Current working directory of this command
	// TODO: Should allow monitoring because the command can change this
	// whenever. I'll just tell you right here: that's gonna be tough. Best I
	// can come up with right now is ptrace the chdir syscall, which is not the
	// end of the world but it's not something I'm going to spend time on right
	// now. You know, what with priorities and all.
	Cwd() (string, error)
	// Working directory that this process was started in. This is set once,
	// errors are not kept around: if the working directory could not be
	// determined at startup, an empty string is stored.  The API could be
	// richer by also allowing one to SET the starting directory before a
	// process is started. I don't use that yet so I prefer keeping the API
	// simple like this, for now.
	StartWd() string
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
