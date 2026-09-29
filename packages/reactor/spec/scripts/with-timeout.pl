#!/usr/bin/env perl
# Usage: with-timeout.pl <secs> <cmd> [args...]
# Runs cmd in its own process group. On timeout sends SIGINT (quint stops its
# Apalache server on SIGINT), then SIGKILL to the group after a grace period.
# Exits with cmd's status, 128+signal if it was signalled, or 124 on timeout.
use strict;
use warnings;
use POSIX ":sys_wait_h";

my $secs = shift @ARGV;
die "usage: with-timeout.pl <secs> <cmd> [args...]\n" unless defined $secs && @ARGV;

my $pid = fork();
die "fork: $!\n" unless defined $pid;
if ($pid == 0) {
  setpgrp(0, 0);
  exec { $ARGV[0] } @ARGV or do { print STDERR "exec $ARGV[0]: $!\n"; POSIX::_exit(127) };
}

sub stop_group {
  kill 'INT', -$pid;
  for (1 .. 20) {
    return if waitpid($pid, WNOHANG) == $pid;
    select(undef, undef, undef, 0.5);
  }
  kill 'KILL', -$pid;
  waitpid($pid, 0);
}

$SIG{INT} = $SIG{TERM} = sub { stop_group(); exit 130 };

my $deadline = time + $secs;
while (1) {
  my $done = waitpid($pid, WNOHANG);
  if ($done == $pid) {
    exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
  }
  if (time >= $deadline) {
    stop_group();
    exit 124;
  }
  select(undef, undef, undef, 0.5);
}
