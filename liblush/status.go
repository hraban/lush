// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"log"
	"time"
)

// TODO: Im not happy about the consistency of this type; what, exactly, are
// the semantics of (the concepts) error, done, started, &c? what does it mean
// to have a nil or non-nil error, in combination with nil or non-nil started,
// nil or non-nil exited, ...? this should be defined.
type cmdstatus struct {
	started   *time.Time
	exited    *time.Time
	err       error
	listeners []func(CmdStatus) error
}

func (s *cmdstatus) startNow() {
	if s.started != nil {
		panic("re-starting status not allowed")
	}
	t := time.Now()
	s.started = &t
	s.changed()
}

func (s *cmdstatus) exitNow() {
	if s.exited != nil {
		panic("status can only be exited once")
	}
	t := time.Now()
	s.exited = &t
	s.changed()
	// Status won't change anymore
	s.listeners = nil
}

func (s *cmdstatus) Started() *time.Time {
	return s.started
}

func (s *cmdstatus) Exited() *time.Time {
	return s.exited
}

func (s *cmdstatus) Success() bool {
	return s.err == nil
}

func (s *cmdstatus) Err() error {
	return s.err
}

func (s *cmdstatus) setErr(e error) {
	if s.err != nil {
		panic("cannot reset error state of command")
	}
	if e != nil {
		s.err = e
		s.changed()
	}
}

func (s *cmdstatus) NotifyChange(f func(CmdStatus) error) {
	s.listeners = append(s.listeners, f)
}

// call this whenever the status has changed to notify the listeners
func (s *cmdstatus) changed() {
	for i := 0; i < len(s.listeners); i++ {
		err := s.listeners[i](s)
		if err != nil {
			log.Printf(
				"Status update notification listener returned error: %v", err)
			s.listeners = append(s.listeners[:i], s.listeners[i+1:]...)
			i--
		}
	}
	if s.Exited() != nil {
		// no more state changes are expected
		s.listeners = nil
	}
}
