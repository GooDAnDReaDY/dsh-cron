      /**
       * Analytics Digest & Schedule Timeline modal handlers (#330, #332, #333, GH #8)
       */
      const openAnalyticsDigest = async (days = 7) => {
        setDigestOpen(true);
        setDigestLoading(true);
        setPeriodDays(days);
        setSendStatus(null);
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/analytics?days=' + encodeURIComponent(days));
          if (data && data.ok) {
            setDigestData(data.digest || null);
            setDigestMarkdown(data.markdown || '');
          }
        } catch (err) {
          console.debug('[dsh-cron] analytics digest fetch failed', err);
        } finally {
          setDigestLoading(false);
        }
      };

      const onSelectPeriod = async (days) => {
        setPeriodDays(days);
        await openAnalyticsDigest(days);
      };

      const onSendTelegram = async () => {
        setSendStatus('⏳ ' + (T_KEY(t, 'digest.sending') || 'Sending...'));
        try {
          const { res, data } = await fetchJsonWithTimeout('/dsh-cron/analytics', {
            method: 'POST',
            body: JSON.stringify({ days: periodDays })
          });
          if (data && data.ok) {
            setSendStatus('✅ ' + (T_KEY(t, 'digest.sent') || 'Sent!'));
          } else {
            setSendStatus('❌ ' + (data?.error || 'Failed'));
          }
        } catch (err) {
          setSendStatus('❌ ' + (err.message || 'Error'));
        }
      };

      const openTimelineModal = async (tab = 'timeline') => {
        setTimelineOpen(true);
        setTimelineLoading(true);
        setTimelineTab(tab);
        try {
          const [timelineRes, heatmapRes] = await Promise.all([
            fetchJsonWithTimeout('/dsh-cron/schedule/timeline-24h?hours=24'),
            fetchJsonWithTimeout('/dsh-cron/analytics/heatmap')
          ]);
          if (timelineRes?.data?.ok && timelineRes?.data?.timeline) {
            setTimelineData(timelineRes.data.timeline);
          }
          if (heatmapRes?.data?.ok && heatmapRes?.data?.heatmap) {
            setHeatmapData(heatmapRes.data.heatmap);
          }
        } catch (err) {
          console.debug('[dsh-cron] timeline fetch failed', err);
        } finally {
          setTimelineLoading(false);
        }
      };

      const onSelectTimelineTab = (tab) => {
        setTimelineTab(tab);
      };
