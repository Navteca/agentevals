interface SessionMetadataProps {
  session: {
    sessionId: string;
    traceId: string;
    metadata: Record<string, any>;
    startedAt: string;
    status: 'active' | 'complete';
    invocations?: Array<{
      modelInfo?: {
        provider?: string;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
      };
    }>;
  };
  liveStats: {
    totalInputTokens: number;
    totalOutputTokens: number;
  };
}

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '10px',
        color: 'var(--text-tertiary)',
        marginBottom: '4px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        {children}
      </div>
    </div>
  );
}

export function SessionMetadata({ session, liveStats }: SessionMetadataProps) {
  const totalTokens = liveStats.totalInputTokens + liveStats.totalOutputTokens;
  const provider = session.invocations?.[0]?.modelInfo?.provider;
  const totalCacheCreation = session.invocations?.reduce((sum, inv) => sum + (inv.modelInfo?.cacheCreationTokens || 0), 0) || 0;
  const totalCacheRead = session.invocations?.reduce((sum, inv) => sum + (inv.modelInfo?.cacheReadTokens || 0), 0) || 0;

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
      marginBottom: '12px',
      display: 'flex',
      gap: '24px',
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      {totalTokens > 0 && (
        <MetadataItem label="Tokens">
          <span style={{ color: '#10b981' }}>
            {totalTokens.toLocaleString()}
          </span>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            marginLeft: '6px',
          }}>
            (↓{liveStats.totalInputTokens.toLocaleString()} ↑{liveStats.totalOutputTokens.toLocaleString()})
          </span>
        </MetadataItem>
      )}

      {(totalCacheCreation > 0 || totalCacheRead > 0) && (
        <MetadataItem label="Cache Tokens">
          <span style={{ color: '#f59e0b' }}>
            {totalCacheRead > 0 && `${totalCacheRead.toLocaleString()} read`}
            {totalCacheCreation > 0 && totalCacheRead > 0 && ' / '}
            {totalCacheCreation > 0 && `${totalCacheCreation.toLocaleString()} created`}
          </span>
        </MetadataItem>
      )}

      {Object.keys(session.metadata).length > 0 && Object.entries(session.metadata).map(([key, value]) => (
        <MetadataItem key={key} label={key}>{String(value)}</MetadataItem>
      ))}
    </div>
  );
}
