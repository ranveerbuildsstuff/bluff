import { Socket } from 'socket.io-client';

export type ConnectionListener = (connected: boolean) => void;

export function setupConnectionTracker(
  targetSocket: Socket,
  onStatusChange: ConnectionListener
): () => void {
  const sync = () => {
    onStatusChange(Boolean(targetSocket.connected));
  };

  // Immediate sync on tracker attachment to prevent missed connect events
  sync();

  const handleConnect = () => onStatusChange(true);
  const handleDisconnect = () => onStatusChange(false);
  const handleConnectError = () => onStatusChange(false);

  targetSocket.on('connect', handleConnect);
  targetSocket.on('disconnect', handleDisconnect);
  targetSocket.on('connect_error', handleConnectError);

  const manager = targetSocket.io;
  manager.on('reconnect', handleConnect);
  manager.on('reconnect_attempt', handleDisconnect);
  manager.on('reconnect_error', handleDisconnect);
  manager.on('reconnect_failed', handleDisconnect);

  return () => {
    targetSocket.off('connect', handleConnect);
    targetSocket.off('disconnect', handleDisconnect);
    targetSocket.off('connect_error', handleConnectError);
    manager.off('reconnect', handleConnect);
    manager.off('reconnect_attempt', handleDisconnect);
    manager.off('reconnect_error', handleDisconnect);
    manager.off('reconnect_failed', handleDisconnect);
  };
}
