// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"errors"
	"io"
	"log"
	"sync"
)

// slightly tweaked io.MultiWriter: if an underlying writer fails it is removed
// and no error is returned. writers can be added and removed on the fly. if
// zero writers are configured Write() calls to this object block.
type FlexibleMultiWriter struct {
	fwd []io.Writer
	l   sync.Mutex
}

// always great success responsibility for failure is here not with caller
func (mw *FlexibleMultiWriter) Write(data []byte) (int, error) {
	mw.l.Lock()
	defer mw.l.Unlock()
	if len(mw.fwd) == 0 {
		// this is not called blocking mate
		return 0, errors.New("FlexibleMultiWriter: set forward pipe before writing")
	}
	var err error
	for i := 0; i < len(mw.fwd); i++ {
		w := mw.fwd[i]
		_, err = w.Write(data)
		if err != nil {
			log.Print("Closing pipe: ", err)
			mw.fwd = append(mw.fwd[:i], mw.fwd[i+1:]...)
			i -= 1
		}
	}
	if err != nil {
		// create fresh slice to allow gc of underlying array
		fresh := make([]io.Writer, len(mw.fwd))
		copy(fresh, mw.fwd)
		mw.fwd = fresh
	}
	return len(data), nil
}

func (mw *FlexibleMultiWriter) AddWriter(w io.Writer) {
	mw.l.Lock()
	defer mw.l.Unlock()
	mw.fwd = append(mw.fwd, w)
}

func (mw *FlexibleMultiWriter) RemoveWriter(w io.Writer) bool {
	mw.l.Lock()
	defer mw.l.Unlock()
	for i, w2 := range mw.fwd {
		if w == w2 {
			mw.fwd = append(mw.fwd[:i], mw.fwd[i+1:]...)
			return true
		}
	}
	return false
}

// Return copy of all underlying writers. This function might very well become
// a bottleneck, but I don't caahahaahaaare, and I dance dance dance and I
// dance dance dance.
func (mw *FlexibleMultiWriter) Writers() []io.Writer {
	mw.l.Lock()
	defer mw.l.Unlock()
	writers := make([]io.Writer, len(mw.fwd))
	copy(writers, mw.fwd)
	return writers
}
