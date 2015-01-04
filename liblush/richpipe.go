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
	"io"
	"sync"
)

// this girl just couples a scrollback buffer to a flexible multiwriter thats
// nice cos you can keep track of the latest bytes that were sent through.
// safe for concurrent use
type richpipe struct {
	listener io.Writer
	peeker   FlexibleMultiWriter
	// Most recently written bytes
	fifo Ringbuffer
	l    sync.Mutex
}

func (p *richpipe) Write(data []byte) (int, error) {
	p.l.Lock()
	defer p.l.Unlock()
	n, err := p.listener.Write(data)
	if n < len(data) && err == nil {
		panic("Illegal return value from listener's Write: " +
			"n < len(data) && err == nil")
	}
	if n < len(data) {
		// only forward succesfully written bytes to the peeker
		data = data[:n]
	}
	p.peeker.Write(data)
	p.fifo.Write(data)
	return n, err
}

func (p *richpipe) SetListener(w io.Writer) {
	p.listener = w
}

func (p *richpipe) GetListener() io.Writer {
	return p.listener
}

func (p *richpipe) Peeker() *FlexibleMultiWriter {
	return &p.peeker
}

func tryClose(thing interface{}) error {
	if c, ok := thing.(io.Closer); ok {
		return c.Close()
	}
	return nil
}

// close underlying writers return the first error encountered, if any
func (p *richpipe) Close() error {
	p.l.Lock()
	defer p.l.Unlock()
	var err error
	err = tryClose(p.listener)
	// OH MY GOD GO WHAT IS WRONG WITH YOU, SERIOUSLY
	for _, x := range p.Peeker().Writers() {
		err2 := tryClose(x)
		if err2 != nil && err == nil {
			err = err2
		}
	}
	return err
}

func (p *richpipe) Scrollback() Ringbuffer {
	return p.fifo
}

func newRichPipe(listener io.Writer, fifosize int) *richpipe {
	return &richpipe{
		listener: listener,
		fifo:     newRingbuf(fifosize),
	}
}
