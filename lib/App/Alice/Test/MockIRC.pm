package App::Alice::Test::MockIRC;

use Any::Moose;
use AnyEvent::IRC::Util qw/parse_irc_msg prefix_nick mk_msg/;

has cbs => (is => 'rw', default => sub {{}});
has nick => (is => 'rw');

has user_prefix => (
  is => 'rw',
  lazy => 1,
  default => sub{
    $_[0]->nick."!".$_[0]->nick."\@host";
  }
);

has events => (
  is => 'rw',
  default => sub {
    my $self = shift;
    {
      TOPIC => sub {
        my ($msg, $nick) = @_;
        $self->cbs->{channel_topic}->($self, @{$msg->{params}}, $nick);
      },
      JOIN => sub {
        my ($msg, $nick) = @_;
        $self->cbs->{join}->($self, $nick, $msg->{params}[0], $nick eq $self->nick);
        $self->cbs->{channel_add}->($self, $msg, $msg->{params}[0], $nick)
      },
      PART => sub {
        my ($msg, $nick) = @_;
        $self->cbs->{part}->($self, $nick, $msg->{params}[0], $nick eq $self->nick);
        $self->cbs->{channel_remove}->($self, $msg, $msg->{params}[0], $nick);
      },
      352 => sub {
        my ($msg) = @_;
        $self->cbs->{irc_352}->($self, $msg);
      },
    }
  }
);

sub send_srv {
  my ($self, $command, @args) = @_;
  my $line;
  if ($command =~ /^TOPIC|JOIN|PART$/) {
    $line = mk_msg($self->user_prefix, $command, @args);
  }
  elsif ($command eq "WHO") {
    $line = ":local.irc 352 test #test test il.comcast.net local.irc test H :0 test";
  }
  $line ? simulate_line($line) : warn "no line mapped for $command\n"
}

sub simulate_line {
  my ($self, $line) = @_;
  my $msg = parse_irc_msg($line);
  my $nick = prefix_nick($msg->{prefix}) || "";
  $self->events->{$msg->{command}}->($msg, $nick);
}

sub enable_ssl {}
sub ctcp_auto_reply {}
sub connect {
  my $self = shift;
  $self->cbs->{connect}->();
  $self->cbs->{registered}->();
}
sub disconnect {
  my $self = shift;
  $self->cbs->{disconnect}->();
}
sub enable_ping {}
sub send_raw {}

sub reg_cb {
  my ($self, %callbacks) = @_;
  for (keys %callbacks) {
    $self->cbs->{$_} = $callbacks{$_}; 
  }
}

1;