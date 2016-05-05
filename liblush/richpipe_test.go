// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"bytes"
	"errors"
	"fmt"
	"testing"
)

func TestRichpipeOutput(t *testing.T) {
	var err error
	var b bytes.Buffer
	p := newRichPipe(&b, 100)
	const txt = "don't mind us, we're just piping through"
	_, err = fmt.Fprintf(p, txt)
	if err != nil {
		t.Errorf("Non-nil error while writing to pipe: %v", err)
	}
	if b.String() != txt {
		t.Errorf("Expected %q, got %q", txt, b.String())
	}
}

func TestRichpipeScrollback(t *testing.T) {
	p := newRichPipe(Devnull, 100)
	sb := p.Scrollback()
	if sb.Size() != 100 {
		t.Errorf("Wrong size scrollback buffer: %d", sb.Size())
	}
	var buf []byte
	var n int
	buf = make([]byte, 50)
	n = sb.Last(buf)
	buf = buf[:n]
	if n != 0 {
		t.Errorf("Read %d bytes from empty scrollback", n)
	}
	if len(buf) != 0 {
		t.Errorf("Illegal size for buffer after empty read: %d", len(buf))
	}
	const txt = "some pipe data"
	var err error
	_, err = fmt.Fprintf(p, txt)
	if err != nil {
		t.Errorf("Non-nil error while writing to pipe: %v", err)
	}
	buf = make([]byte, 5)
	n = sb.Last(buf)
	buf = buf[:n]

	if n != 5 {
		t.Errorf("Illegal size from scrollback.Last: %d", n)
	}
	if string(buf) != " data" {
		t.Errorf("Illegal contents of scrollback buffer: %q", string(buf))
	}
}

// limit written bytes
type maxWriter int

func (m *maxWriter) Write(data []byte) (int, error) {
	old := int(*m)
	// jesus christ man is this really necessary?
	*m = maxWriter(int(*m) - len(data))
	if int(*m) < 0 {
		*m = 0
		return old, errors.New("byte write limit reached")
	}
	return len(data), nil
}

func TestRichpipeListenerError(t *testing.T) {
	w := maxWriter(3)
	p := newRichPipe(&w, 100)
	n, err := fmt.Fprintf(p, "abcdef")
	if err == nil {
		t.Errorf("Expected error when writing to pipe without listener")
	}
	if n != 3 {
		t.Errorf("Should have written 3 bytes, wrote %d", n)
	}
	var buf []byte
	buf = make([]byte, 100)
	n = p.Scrollback().Last(buf)
	buf = buf[:n]
	if n != 3 {
		t.Errorf("Expected three bytes in scrollback buffer, got %d", n)
	}
	if string(buf) != "abc" {
		t.Errorf("Unexpected contents in scrollback buffer: %q", string(buf))
	}
}
