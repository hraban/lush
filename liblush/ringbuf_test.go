// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"bytes"
	"testing"
)

func TestRingbuf(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	n, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(buf) {
		t.Error("Unexpected write byte-count:", n)
	}
	buf2 := make([]byte, 3)
	n = r.Last(buf2)
	buf2 = buf2[:n]
	if n != 3 {
		t.Errorf("Filled read buffer with %d bytes expected 3", n)
	}
	if !bytes.Equal(buf2, []byte{7, 8, 9}) {
		t.Error("Unexpected last bytes:", buf2)
	}
	buf3 := []byte{10, 11, 12}
	n, err = r.Write(buf3)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(buf3) {
		t.Error("Unexpected write byte-count:", n)
	}
	buf4 := make([]byte, 20)
	n = r.Last(buf4)
	buf4 = buf4[:n]
	if n != 5 {
		t.Errorf("Filled read buffer with %d bytes expected 5", n)
	}
	if !bytes.Equal(buf4, []byte{8, 9, 10, 11, 12}) {
		t.Error("Unexpected last bytes:", buf4)
	}
	seen := r.(*ringbuf_safe).ringbuf_unsafe.seen
	if seen != 13 {
		t.Error("Saw 13 bytes, recorded ", seen)
	}
	r.Resize(3)
	n = r.Last(buf)
	buf = buf[:n]
	if n != 3 {
		t.Errorf("Filled read buffer with %d bytes expected 3", n)
	}
	if !bytes.Equal(buf, []byte{10, 11, 12}) {
		t.Error("Unexpected last bytes after resizing:", buf)
	}
	r.Resize(0)
	n = r.Last(buf)
	if n != 0 {
		t.Errorf("Last wrote data to buffer after Resize(0)")
	}
}

// write less than total ringbuf size
func TestRingbuf_WriteLess(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	buf2 := make([]byte, 20)
	n := r.Last(buf2)
	buf2 = buf2[:n]
	if n != 3 {
		t.Error("Unexpected ringbuf contents length:", n)
	}
	if !bytes.Equal(buf2, buf) {
		t.Error("Unexpected ringbuf contents:", buf2)
	}
}

// write more than total ringbuf size
func TestRingbuf_WriteMore(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	buf2 := make([]byte, 20)
	n := r.Last(buf2)
	buf2 = buf2[:n]
	if n != 5 {
		t.Error("Unexpected ringbuf contents length:", n)
	}
	if !bytes.Equal(buf2, []byte{5, 6, 7, 8, 9}) {
		t.Error("Unexpected ringbuf contents:", buf2)
	}
}

func TestRingbuf_ResizeLarger(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	r.Resize(100)
	buf2 := make([]byte, 20)
	n := r.Last(buf2)
	buf2 = buf2[:n]
	if n != 5 {
		t.Error("Expected 5 bytes in resized ringbuffer, not", n)
	}
	if !bytes.Equal(buf2, []byte{5, 6, 7, 8, 9}) {
		t.Error("Unexpected contents in resized ringbuffer:", buf2)
	}
}

func TestRingbuf_ResizeSmaller(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	r.Resize(3)
	buf2 := make([]byte, 20)
	n := r.Last(buf2)
	buf2 = buf2[:n]
	if n != 3 {
		t.Error("Expected 3 bytes in resized ringbuffer, not", n)
	}
	if !bytes.Equal(buf2, []byte{7, 8, 9}) {
		t.Error("Unexpected contents in resized ringbuffer:", buf2)
	}
}

func TestRingbuf_ResizeZero(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	r.Resize(0)
	buf2 := make([]byte, 10)
	n := r.Last(buf2)
	if n != 0 {
		t.Error("Unexpected contents after resizing to zero:", n, "bytes")
	}
}

func TestRingbuf_WriteTo(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	_, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	var target bytes.Buffer
	_, err = r.WriteTo(&target)
	if err != nil {
		t.Fatalf("WriteTo error: %v", err)
	}
	writeToBytes := target.Bytes()
	if !bytes.Equal(writeToBytes, []byte{5, 6, 7, 8, 9}) {
		t.Error("Unexpected contents in WriteTo buffer:", writeToBytes)
	}
	target.Reset()
	r.Resize(0)
	_, err = r.WriteTo(&target)
	if err != nil {
		t.Fatalf("WriteTo error: %v", err)
	}
	if target.Len() != 0 {
		t.Error("WriteTo buffer should be empty:", target.Bytes())
	}
}
