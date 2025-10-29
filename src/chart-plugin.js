/**
 * markdown-it plugin for rendering chart blocks
 * 
 * Transforms ```chart blocks containing YAML data into dataroom-chart elements
 */
import yaml from 'js-yaml';

/**
 * Chart block plugin for markdown-it
 * @param {*} md - markdown-it instance
 */
export default function chartPlugin(md) {
  const originalFence = md.renderer.rules.fence || function(tokens, idx, options, env, slf) {
    return slf.renderToken(tokens, idx, options);
  };

  md.renderer.rules.fence = function(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    
    // Check if this is a chart block
    if (info === 'chart') {
      try {
        // Parse YAML content
        const chartConfig = yaml.load(token.content);
        
        // Convert chart config to dataroom-chart attributes
        const attrs = [];
        
        // Map common chart properties to attributes
        if (chartConfig.type) {
          attrs.push(`type="${chartConfig.type}"`);
        }
        if (chartConfig.width) {
          attrs.push(`width="${chartConfig.width}"`);
        }
        if (chartConfig.height) {
          attrs.push(`height="${chartConfig.height}"`);
        }
        if (chartConfig.orientation) {
          attrs.push(`orientation="${chartConfig.orientation}"`);
        }
        if (chartConfig.monochrome) {
          attrs.push(`monochrome="${chartConfig.monochrome}"`);
        }
        if (chartConfig.color) {
          attrs.push(`color="${chartConfig.color}"`);
        }
        if (chartConfig.lineWidth) {
          attrs.push(`line-width="${chartConfig.lineWidth}"`);
        }
        if (chartConfig.radius) {
          attrs.push(`radius="${chartConfig.radius}"`);
        }
        if (chartConfig.minRadius) {
          attrs.push(`min-radius="${chartConfig.minRadius}"`);
        }
        if (chartConfig.maxRadius) {
          attrs.push(`max-radius="${chartConfig.maxRadius}"`);
        }
        if (chartConfig.labels !== undefined) {
          attrs.push(`labels="${chartConfig.labels}"`);
        }

        // Extract data from the config
        const data = chartConfig.data || [];
        const dataJson = JSON.stringify(data);
        
        // Create the dataroom-chart element
        return `<dataroom-chart ${attrs.join(' ')}>${dataJson}</dataroom-chart>\n`;
        
      } catch (error) {
        // If YAML parsing fails, show error in a code block
        console.warn('Chart block YAML parsing error:', error);
        return `<div class="chart-error">
          <strong>Chart Error:</strong> Invalid YAML format
          <pre><code>${token.content}</code></pre>
        </div>\n`;
      }
    }
    
    // For non-chart blocks, use the original renderer
    return originalFence(tokens, idx, options, env, slf);
  };
}