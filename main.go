// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"flag"
	"log"
)

func main() {
	s := newServer()
	listenaddr := flag.String("l", "localhost:8081", "listen address")
	passwd := flag.String("p", "", "password")
	flag.BoolVar(&s.everybodyMaster, "everybodymaster", false,
		"grant every incoming connection full privileges. when false only the first connection is a master")
	flag.Parse()
	if *passwd != "" {
		s.SetPassword(*passwd)
	}
	err := s.Run(*listenaddr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", *listenaddr, err)
	}
	return
}
