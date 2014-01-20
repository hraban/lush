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
