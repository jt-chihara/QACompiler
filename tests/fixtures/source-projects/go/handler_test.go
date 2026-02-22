package main

import "testing"

func TestHandleCreate(t *testing.T) {
	err := HandleCreate("test")
	if err != nil {
		t.Fatal(err)
	}
}
