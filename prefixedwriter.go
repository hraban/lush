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

package main

import (
	"errors"
	"io"
)

// prefix all calls to underlying Write() with a fixed message
type prefixedWriter struct {
	io.Writer
	Prefix []byte
}

// copy data to a new buffer to accomodate prefix and call underlying Write
// only once
func (pw *prefixedWriter) Write(p []byte) (int, error) {
	newbuf := make([]byte, len(p)+len(pw.Prefix))
	n := copy(newbuf, pw.Prefix)
	copy(newbuf[n:], p)
	return pw.Writer.Write(newbuf)
}

// close underlying writer if supported, error if not io.Closer
func (pw *prefixedWriter) Close() error {
	if c, ok := pw.Writer.(io.Closer); ok {
		return c.Close()
	}
	return errors.New("underlying writer does not have Close() method")
}

func newPrefixedWriter(w io.Writer, prefix []byte) *prefixedWriter {
	return &prefixedWriter{
		Writer: w,
		Prefix: prefix,
	}
}
