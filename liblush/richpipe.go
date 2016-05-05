// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

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
