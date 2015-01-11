// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// +build !windows

package main

import (
	"os"
)

var StopSignal = os.Interrupt
