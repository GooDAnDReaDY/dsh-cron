    function pickDeliverySettings(source) {
      const out = {};
      for (const key of DELIVERY_SETTING_KEYS.concat(TEMPLATE_SETTING_KEYS)) {
        if (source && source[key] !== undefined && source[key] !== null) out[key] = source[key];
      }
      if (out.channelTemplates && typeof out.channelTemplates === 'object') {
        out.channelTemplates = Object.assign({}, out.channelTemplates);
      }
      return out;
    }

    /**
     * Shared delivery form used by both the task panel modal and the plugin
     * settings card, so a new channel is added in exactly one place.
     * Sections collapse via the canonical aria-expanded head contract.
     */
    function renderDeliverySettings({ T, values, onChange, onChannelTemplate, sections, onToggleSection }) {
      const val = (key) => (values[key] === undefined || values[key] === null ? '' : String(values[key]));
      const field = (f) => React.createElement('div', { className: 'dsh-cron-form-group', key: f.key, style: { marginBottom: '10px' } },
        React.createElement('label', null, T(f.labelKey)),
        React.createElement('input', f.numeric ? {
          type: 'number',
          min: f.min !== undefined ? f.min : 1000,
          step: 1000,
          value: val(f.key),
          placeholder: String(f.defaultValue !== undefined ? f.defaultValue : 15000),
          // #115: clearing the field must send the explicit default. Deleting the
          // key would leave the previously stored value in place (the settings
          // scope skips absent keys), so the field would silently keep 1 ms.
          onChange: (e) => onChange(f.key, e.target.value === ''
            ? (f.defaultValue !== undefined ? f.defaultValue : 15000)
            : Number(e.target.value)),
        } : {
          type: 'text',
          value: val(f.key),
          placeholder: f.placeholderKey ? T(f.placeholderKey) : '',
          onChange: (e) => onChange(f.key, e.target.value)
        })
      );
      const section = (key, titleKey, children) => {
        const open = Boolean(sections[key]);
        return React.createElement('div', { className: 'dsh-cron-section', key },
          React.createElement('button', {
            type: 'button',
            className: 'dsh-cron-section-head',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => onToggleSection(key)
          },
            React.createElement('span', null, T(titleKey)),
            React.createElement('span', { className: 'dsh-cron-section-chevron', 'data-open': open ? 'true' : 'false' }, '▾')
          ),
          open && React.createElement('div', { className: 'dsh-cron-section-body' }, children)
        );
      };

      return [
        section('secrets', 'settings.secretsSection', [
          React.createElement('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.secretsHint')),
          ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'secrets').map(field),
        ]),
        section('channels', 'settings.deliverySection', [
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'row' },
            ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'channels').map(field)
          ),
        ]),
        section('automation', 'settings.automationSection', [
          React.createElement('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.automationHint')),
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'row' },
            ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'automation').map(field)
          ),
        ]),
        section('templates', 'settings.templatesSection', [
          React.createElement('div', { className: 'dsh-cron-form-group', key: 'global', style: { marginBottom: '10px' } },
            React.createElement('label', null, T('settings.templateLabel')),
            React.createElement('input', {
              type: 'text',
              value: val('template'),
              onChange: (e) => onChange('template', e.target.value)
            }),
            React.createElement('div', { className: 'dsh-cron-hint' }, T('settings.templateHint'))
          ),
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'perchannel' },
            ...DELIVERY_CHANNELS.map((id) => React.createElement('div', { className: 'dsh-cron-form-group', key: id, style: { marginBottom: '10px' } },
              React.createElement('label', null, T('settings.channelTemplateLabel', { channel: T(CHANNEL_LABEL_KEYS[id]) })),
              React.createElement('input', {
                type: 'text',
                value: (values.channelTemplates && values.channelTemplates[id]) || '',
                onChange: (e) => onChannelTemplate(id, e.target.value)
              })
            ))
          ),
        ]),
      ];
    }

    /** Parse a KEY=VALUE textarea into the task env object (#38). */
