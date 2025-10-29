/**
 * Markdown renderer component with chart support
 * 
 * Renders markdown content to HTML with support for chart blocks
 */
import DataroomElement from 'dataroom-js';
import MarkdownIt from 'markdown-it';
import chartPlugin from './chart-plugin.js';

// Import dataroom-chart to ensure it's registered
import 'dataroom-charts/src/dataroom-chart.js';

class MarkdownRenderer extends DataroomElement {
  
  async initialize() {
    // Initialize markdown-it with the chart plugin
    this.md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true
    });
    
    // Use the chart plugin
    this.md.use(chartPlugin);
    
    // Get initial content from the element
    const initialContent = this.getAttribute('content') || this.textContent || '';
    
    // Clear the element
    this.innerHTML = '';
    
    // Render the markdown
    this.render(initialContent);
    
    // Set up content observation for updates
    this.setupContentObserver();
  }
  
  /**
   * Render markdown content to HTML
   * @param {string} markdown - The markdown content to render
   */
  render(markdown) {
    try {
      const html = this.md.render(markdown);
      this.innerHTML = html;
      
      // Emit a render event
      this.dispatchEvent(new CustomEvent('markdown-rendered', {
        detail: { markdown, html },
        bubbles: true
      }));
    } catch (error) {
      console.error('Markdown rendering error:', error);
      this.innerHTML = `<div class="render-error">
        <strong>Rendering Error:</strong> ${error.message}
      </div>`;
    }
  }
  
  /**
   * Update the markdown content
   * @param {string} markdown - New markdown content
   */
  updateContent(markdown) {
    this.render(markdown);
  }
  
  /**
   * Setup observer for content attribute changes
   */
  setupContentObserver() {
    // Observe attribute changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'content') {
          const newContent = this.getAttribute('content');
          if (newContent !== null) {
            this.render(newContent);
          }
        }
      });
    });
    
    observer.observe(this, { attributes: true });
  }
  
  /**
   * Get the current rendered HTML
   * @returns {string} The rendered HTML content
   */
  getHTML() {
    return this.innerHTML;
  }
  
  /**
   * Get the markdown-it instance (for advanced usage)
   * @returns {MarkdownIt} The markdown-it instance
   */
  getMarkdownIt() {
    return this.md;
  }
}

customElements.define('markdown-renderer', MarkdownRenderer);

export default MarkdownRenderer;