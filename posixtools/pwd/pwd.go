// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"fmt"
	"os"
)

func printerr(err error) {
	fmt.Fprintf(os.Stderr, "%v\n", err)
	os.Exit(1)
}

func main() {
	//_, err := fmt.Println(os.Args[1:]...)
	// cannot use os.Args (type []string) as type []interface {} in function
	// argument
	// OHMYGOD GO WHAT IS WRONG WITH YOU
	wd, err := os.Getwd()
	if err != nil {
		printerr(err)
	}
	_, err = fmt.Println(wd)
	if err != nil {
		printerr(err)
	}
}
