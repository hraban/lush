FROM golang:1.6

ADD . /go/src/github.com/hraban/lush
# go get on image creation time to fetch and build all dependencies and build
# the lush server binary. Useless without client source.
RUN go get github.com/hraban/lush

# Using this image you can rebuild using latest source (using volume mapping),
# cross compile, or even run server from within docker (defeats the purpose of
# lush but it's possible). See README.
