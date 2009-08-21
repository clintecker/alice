use 5.008001;
use MooseX::Declare;

class App::Alice {
  use App::Alice::Window;
  use App::Alice::HTTPD;
  use App::Alice::IRC;
  use MooseX::AttributeHelpers;
  use Digest::CRC qw/crc16/;
  use POE;

  our $VERSION = '0.01';

  has config => (
    is       => 'ro',
    isa      => 'HashRef',
    required => 1,
  );

  has assetdir => (
    is        => 'ro',
    isa       => 'Str',
    required  => 1,
  );

  has ircs => (
    is      => 'ro',
    isa     => 'HashRef[HashRef]',
    default => sub {{}},
  );

  has httpd => (
    is      => 'ro',
    isa     => 'App::Alice::HTTPD',
    lazy    => 1,
    default => sub {
      App::Alice::HTTPD->new(app => shift);
    },
  );

  has dispatcher => (
    is      => 'ro',
    isa     => 'App::Alice::CommandDispatch',
    default => sub {
      App::Alice::CommandDispatch->new(app => shift);
    }
  );

  has notifier => (
    is      => 'ro',
    default => sub {
      eval {
        if ($^O eq 'darwin') {
          require App::Alice::Notifier::Growl;
          App::Alice::Notifier::Growl->new;
        }
        elsif ($^O eq 'linux') {
          require App::Alice::Notifier::LibNotify;
          App::Alice::Notifier::LibNotify->new;
        }
      }
    }
  );

  has window_map => (
    metaclass => 'Collection::Hash',
    isa       => 'HashRef[App::Alice::Window]',
    default   => sub {{}},
    provides  => {
      values => 'windows',
      set    => 'add_window',
      exists => 'has_window',
      get    => 'get_window',
      delete => 'remove_window',
      keys   => 'window_ids',
    }
  );
  
  method dispatch (Str $command, App::Alice::Window $window) {
    $self->dispatcher->handle($command, $window);
  }
  
  method nick_windows (Str $nick) {
    return grep {$_->includes_nick($nick)} $self->windows;
  }

  method buffered_messages (Int $min) {
    return [ grep {$_->{msgid} > $min} map {@{$_->msgbuffer}} $self->windows ];
  }

  method connections {
    return map {$_->connection} values %{$self->ircs};
  }

  method find_or_create_window (Str $title, $connection) {
    my $id = "win_" . crc16(lc($title . $connection->session_alias));
    if (my $window = $self->get_window($id)) {
      return $window;
    }
    my $window = App::Alice::Window->new(
      title      => $title,
      connection => $connection,
      assetdir   => $self->assetdir,
    );  
    $self->add_window($id, $window);
  }

  method close_window (App::Alice::Window $window) {
    return unless $window;
    $self->send($window->close_action);
    $self->log_debug("sending a request to close a tab: " . $window->title)
      if $self->httpd->has_clients;
    $self->remove_window($window->id);
  }

  method add_irc_server (Str $name, HashRef $config) {
    $self->ircs->{$name} = App::Alice::IRC->new(
      app    => $self,
      alias  => $name,
      config => $config
    );
  }

  method run {
    $self->httpd;
    $self->add_irc_server($_, $self->config->{servers}{$_})
      for keys %{$self->config->{servers}};
    POE::Kernel->run;
  }

  sub send {
    my ($self, @messages) = @_;
    $self->httpd->send(@messages);
    return unless $self->notifier and ! $self->httpd->has_clients;
    for my $message (@messages) {
      $self->notifier->display($message) if $message->{highlight};
    }
  }

  sub log_debug {
    shift;
    print STDERR join(" ", @_) . "\n";
  }
}