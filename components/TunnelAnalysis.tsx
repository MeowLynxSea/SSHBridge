import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { ClientAccessLog } from '../src/types/stats';
import Tunnel from '../types/Tunnel';
import WorldMap from 'react-svg-worldmap';

interface ClientAccessStats {
  totalConnections: number;
  uniqueIPs: number;
  totalBytesTransferred: number;
  averageConnectionDuration: number;
  topCountries: Array<{ country: string; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
}

type TimeRange =
  | 'today'
  | 'thisWeek'
  | 'thisMonth'
  | 'lastDay'
  | 'lastWeek'
  | 'lastMonth'
  | 'custom';

interface AnalysisProps {
  tunnels: Tunnel[];
}

export default function TunnelAnalysis({ tunnels }: AnalysisProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [selectedTunnel, setSelectedTunnel] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('lastDay');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [accessLogs, setAccessLogs] = useState<ClientAccessLog[]>([]);
  const [accessStats, setAccessStats] = useState<ClientAccessStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [mapView, setMapView] = useState<'connections' | 'uniqueIPs' | 'dataTransferred'>(
    'connections'
  );

  // Set initial selected tunnel when tunnels are available
  useEffect(() => {
    if (tunnels.length > 0 && !selectedTunnel) {
      setSelectedTunnel(tunnels[0].id);
    }
  }, [tunnels, selectedTunnel]);

  // Calculate date range based on selection
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeRange) {
      case 'today': {
        return {
          days: 0,
          startDate: today.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      }

      case 'thisWeek': {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return {
          days: 0,
          startDate: startOfWeek.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      }

      case 'thisMonth': {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          days: 0,
          startDate: startOfMonth.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      }

      case 'lastDay': {
        return { days: 1, startDate: '', endDate: '' };
      }

      case 'lastWeek': {
        return { days: 7, startDate: '', endDate: '' };
      }

      case 'lastMonth': {
        return { days: 30, startDate: '', endDate: '' };
      }

      case 'custom': {
        return { days: 0, startDate: customStartDate, endDate: customEndDate };
      }

      default:
        return { days: 1, startDate: '', endDate: '' };
    }
  };

  const fetchData = async () => {
    if (!selectedTunnel || !token) return;

    setIsLoading(true);
    setError('');

    try {
      const { days, startDate, endDate } = getDateRange();

      // For custom date range, we need to use a different approach
      let queryParam = days > 0 ? `days=${days}` : `startDate=${startDate}&endDate=${endDate}`;

      // Fetch access logs
      const logsResponse = await fetch(
        `/api/tunnels/${selectedTunnel}/access-logs?limit=200&${queryParam}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        if (logsData.success) {
          // Filter logs based on date range for custom ranges
          let filteredLogs = logsData.logs;
          if (timeRange === 'custom' && startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include the entire end date

            filteredLogs = logsData.logs.filter((log: ClientAccessLog) => {
              const logDate = new Date(log.connection_start_time);
              return logDate >= start && logDate <= end;
            });
          }
          setAccessLogs(filteredLogs);
        } else {
          setError('Failed to fetch access logs');
        }
      } else {
        setError('Failed to fetch access logs');
      }

      // Fetch access stats
      const statsResponse = await fetch(
        `/api/tunnels/${selectedTunnel}/access-stats?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setAccessStats(statsData.stats);
        } else {
          setError('Failed to fetch access stats');
        }
      } else {
        setError('Failed to fetch access stats');
      }
    } catch (err) {
      setError('Network error');
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when selected tunnel or time range changes
  useEffect(() => {
    if (selectedTunnel) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTunnel, timeRange, customStartDate, customEndDate]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getChartHeight = (): number => {
    const maxCount = Math.max(...(accessStats?.hourlyActivity.map((h) => h.count) || [0]));
    return Math.min(300, Math.max(200, maxCount * 2)); // Limit height to max 300px
  };

  // Process access logs to get country data for the map
  const mapData = useMemo(() => {
    if (!accessLogs.length) return [];

    const countryData: {
      [key: string]: { connections: number; uniqueIPs: Set<string>; dataTransferred: number };
    } = {};

    accessLogs.forEach((log) => {
      if (log.client_country) {
        // Handle special case for local/private networks
        let countryCode = log.client_country;
        if (log.client_country === 'Local') {
          countryCode = 'Local'; // Special identifier for local/private networks
        }

        if (!countryData[countryCode]) {
          countryData[countryCode] = {
            connections: 0,
            uniqueIPs: new Set(),
            dataTransferred: 0,
          };
        }

        countryData[countryCode].connections++;
        if (log.client_ip) {
          countryData[countryCode].uniqueIPs.add(log.client_ip);
        }
        countryData[countryCode].dataTransferred +=
          (log.bytes_sent || 0) + (log.bytes_received || 0);
      }
    });

    return Object.entries(countryData).map(([country, data]) => ({
      country,
      value:
        mapView === 'connections'
          ? data.connections
          : mapView === 'uniqueIPs'
            ? data.uniqueIPs.size
            : data.dataTransferred,
      uniqueIPs: data.uniqueIPs.size,
      dataTransferred: data.dataTransferred,
    }));
  }, [accessLogs, mapView]);

  if (tunnels.length === 0) {
    return (
      <div className="nb-box nb-card">
        <div className="nb-card-header">
          <h2 className="nb-card-title">{t('analysis.tunnelAnalysis')}</h2>
        </div>
        <div className="nb-card-body">
          <p>{t('analysis.noTunnels')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '40px' }}>
      <div className="nb-box nb-card" style={{ marginBottom: '30px' }}>
        <div className="nb-card-header">
          <h2 className="nb-card-title">{t('analysis.tunnelAnalysis')}</h2>
        </div>
        <div className="nb-card-body">
          {/* Tunnel and Time Range Selection */}
          <div style={{ marginBottom: '25px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Tunnel Selection */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label
                  htmlFor="tunnel-select"
                  style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
                >
                  {t('analysis.selectTunnel')}:
                </label>
                <select
                  id="tunnel-select"
                  className="nb-input"
                  value={selectedTunnel || ''}
                  onChange={(e) => setSelectedTunnel(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px' }}
                >
                  {tunnels.map((tunnel) => (
                    <option key={tunnel.id} value={tunnel.id}>
                      {tunnel.name} ({t('analysis.port')}: {tunnel.external_port})
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range Selection */}
              <div style={{ flex: '1', minWidth: '250px' }}>
                <label
                  htmlFor="time-range-select"
                  style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
                >
                  {t('analysis.timeRange')}:
                </label>
                <select
                  id="time-range-select"
                  className="nb-input"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  style={{ width: '100%', padding: '10px' }}
                >
                  <option value="today">{t('analysis.today')}</option>
                  <option value="thisWeek">{t('analysis.thisWeek')}</option>
                  <option value="thisMonth">{t('analysis.thisMonth')}</option>
                  <option value="lastDay">{t('analysis.lastDay')}</option>
                  <option value="lastWeek">{t('analysis.lastWeek')}</option>
                  <option value="lastMonth">{t('analysis.lastMonth')}</option>
                  <option value="custom">{t('analysis.custom')}</option>
                </select>
              </div>
            </div>

            {/* Custom Date Range */}
            {timeRange === 'custom' && (
              <div
                style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'center' }}
              >
                <div style={{ flex: '1' }}>
                  <label
                    htmlFor="start-date"
                    style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}
                  >
                    {t('analysis.startDate')}:
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    className="nb-input"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', padding: '10px' }}
                  />
                </div>
                <div style={{ flex: '1' }}>
                  <label
                    htmlFor="end-date"
                    style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}
                  >
                    {t('analysis.endDate')}:
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    className="nb-input"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', padding: '10px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {error && <div className="nb-alert nb-alert-destructive">{error}</div>}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div className="nb-loader"></div>
              <p>{t('analysis.loadingData')}</p>
            </div>
          ) : selectedTunnel && accessStats ? (
            <div>
              {/* Stats Overview */}
              <div className="nb-box" style={{ marginBottom: '30px', padding: '20px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '1.3rem' }}>
                  {t('analysis.statsOverview')}
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '20px',
                  }}
                >
                  <div className="nb-box" style={{ padding: '15px', textAlign: 'center' }}>
                    <div
                      style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}
                    >
                      {accessStats.totalConnections}
                    </div>
                    <div>{t('analysis.totalConnections')}</div>
                  </div>
                  <div className="nb-box" style={{ padding: '15px', textAlign: 'center' }}>
                    <div
                      style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}
                    >
                      {accessStats.uniqueIPs}
                    </div>
                    <div>{t('analysis.uniqueIPs')}</div>
                  </div>
                  <div className="nb-box" style={{ padding: '15px', textAlign: 'center' }}>
                    <div
                      style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}
                    >
                      {formatBytes(accessStats.totalBytesTransferred)}
                    </div>
                    <div>{t('analysis.totalBytesTransferred')}</div>
                  </div>
                  <div className="nb-box" style={{ padding: '15px', textAlign: 'center' }}>
                    <div
                      style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}
                    >
                      {formatDuration(accessStats.averageConnectionDuration)}
                    </div>
                    <div>{t('analysis.averageConnectionDuration')}</div>
                  </div>
                </div>
              </div>

              {/* Top Countries */}
              {accessStats.topCountries.length > 0 && (
                <div className="nb-box" style={{ marginBottom: '30px', padding: '20px' }}>
                  <h3 style={{ marginBottom: '20px', fontSize: '1.3rem' }}>
                    {t('analysis.topCountries')}
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                    {accessStats.topCountries.map((country, index) => (
                      <div
                        key={country.country}
                        className="nb-badge"
                        style={{
                          backgroundColor:
                            index === 0 ? 'var(--accent-color)' : 'var(--gray-light)',
                          color: index === 0 ? 'var(--bg-color)' : 'var(--fg-color)',
                          padding: '8px 16px',
                          fontSize: '1rem',
                        }}
                      >
                        {country.country}: {country.count} {t('analysis.connections')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hourly Activity Chart */}
              {accessStats.hourlyActivity.length > 0 && (
                <div className="nb-box" style={{ marginBottom: '30px', padding: '20px' }}>
                  <h3 style={{ marginBottom: '20px', fontSize: '1.3rem' }}>
                    {t('analysis.hourlyActivity')}
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      height: `${getChartHeight()}px`,
                      alignItems: 'flex-end',
                      gap: '5px',
                      padding: '10px 0',
                    }}
                  >
                    {accessStats.hourlyActivity.map((hour) => (
                      <div
                        key={hour.hour}
                        style={{
                          flex: '1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            backgroundColor: 'var(--accent-color)',
                            height: `${(hour.count / Math.max(...accessStats.hourlyActivity.map((h) => h.count))) * 100}%`,
                            borderRadius: '4px 4px 0 0',
                            minHeight: '2px',
                          }}
                        ></div>
                        <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>{hour.hour}h</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-dark)' }}>
                          {hour.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* World Map Visualization */}
              <div className="nb-box" style={{ marginBottom: '30px', padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                  }}
                >
                  <h3 style={{ fontSize: '1.3rem' }}>{t('analysis.globalDistribution')}</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className={mapView === 'connections' ? 'nb-btn nb-btn-accent' : 'nb-btn'}
                      onClick={() => setMapView('connections')}
                      style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                    >
                      {t('analysis.viewByConnections')}
                    </button>
                    <button
                      className={mapView === 'uniqueIPs' ? 'nb-btn nb-btn-accent' : 'nb-btn'}
                      onClick={() => setMapView('uniqueIPs')}
                      style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                    >
                      {t('analysis.viewByUniqueIPs')}
                    </button>
                    <button
                      className={mapView === 'dataTransferred' ? 'nb-btn nb-btn-accent' : 'nb-btn'}
                      onClick={() => setMapView('dataTransferred')}
                      style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                    >
                      {t('analysis.viewByDataTransferred')}
                    </button>
                  </div>
                </div>

                {mapData.length > 0 ? (
                  <>
                    {/* Filter out local connections for the world map */}
                    {mapData.filter((data) => data.country !== 'Local').length > 0 ? (
                      <div
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'center',
                          backgroundColor: 'var(--bg-color)',
                          borderRadius: '8px',
                          padding: '20px',
                          overflow: 'hidden',
                        }}
                      >
                        <WorldMap
                          color="#ff4500"
                          size="responsive"
                          data={mapData.filter((data) => data.country !== 'Local')}
                          richInteraction={true}
                          styleFunction={(context) => {
                            const { countryValue, minValue, maxValue } = context;

                            // Handle undefined values (countries with no data)
                            if (countryValue === undefined || countryValue === null) {
                              return {
                                fill: '#ffe8d6', // Light cream instead of white
                                fillOpacity: 1,
                                stroke: '#999999', // Darker border
                                strokeWidth: 0.8,
                                strokeOpacity: 0.8,
                                cursor: 'pointer',
                              };
                            }

                            // Calculate the ratio for gradient (0 to 1)
                            const ratio =
                              maxValue > minValue
                                ? (Number(countryValue) - minValue) / (maxValue - minValue)
                                : 0;

                            // Create gradient from vibrant orange (#ff4500) to light orange cream (#ffe8d6)
                            // Higher values = more orange, Lower values = light cream
                            const r = Math.floor(255 - (255 - 255) * ratio); // Red stays at 255
                            const g = Math.floor(232 - (232 - 69) * ratio); // Green: 232 -> 69
                            const b = Math.floor(214 - (214 - 0) * ratio); // Blue: 214 -> 0

                            return {
                              fill: `rgb(${r}, ${g}, ${b})`,
                              fillOpacity: 1,
                              stroke: '#666666', // Darker border for visibility
                              strokeWidth: 0.8,
                              strokeOpacity: 0.8,
                              cursor: 'pointer',
                            };
                          }}
                          tooltipTextFunction={(context) => {
                            const { countryValue } = context;
                            if (countryValue === undefined || countryValue === null)
                              return `${context.countryName}: 0`;

                            if (mapView === 'dataTransferred') {
                              return `${context.countryName}: ${formatBytes(Number(countryValue))}`;
                            } else {
                              return `${context.countryName}: ${Number(countryValue).toLocaleString()}`;
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '40px 20px',
                          color: 'var(--gray-dark)',
                        }}
                      >
                        <p>{t('analysis.noGeographicData')}</p>
                      </div>
                    )}

                    {/* Display local/private network connections separately */}
                    {mapData.some((data) => data.country === 'Local') && (
                      <div
                        style={{
                          marginTop: '20px',
                          padding: '15px',
                          backgroundColor: 'var(--gray-light)',
                          borderRadius: '8px',
                        }}
                      >
                        {mapData
                          .filter((data) => data.country === 'Local')
                          .map((data) => (
                            <div
                              key="local"
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '8px',
                              }}
                            >
                              <span>本地/局域网连接</span>
                              <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                {mapView === 'dataTransferred'
                                  ? formatBytes(data.value)
                                  : data.value.toLocaleString()}
                                <span
                                  style={{
                                    marginLeft: '10px',
                                    fontSize: '0.9rem',
                                    color: 'var(--gray-dark)',
                                  }}
                                >
                                  ({data.uniqueIPs} {t('analysis.uniqueIPs')})
                                </span>
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray-dark)' }}
                  >
                    <p>{t('analysis.noGeographicData')}</p>
                  </div>
                )}
              </div>

              {accessLogs.length === 0 && (
                <div className="nb-box" style={{ padding: '30px', textAlign: 'center' }}>
                  <p>{t('analysis.noRecordsInRange')}</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>{t('analysis.selectTunnelToView')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
