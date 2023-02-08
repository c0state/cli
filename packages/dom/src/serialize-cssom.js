import { resourceFromText } from './utils';
import { uid } from './prepare-dom';

// Returns true if a stylesheet is a CSSOM-based stylesheet.
function isCSSOM(styleSheet) {
  // no href, has a rulesheet, and has an owner node
  return !styleSheet.href && styleSheet.cssRules && styleSheet.ownerNode;
}

// Returns false if any stylesheet rules do not match between two stylesheets
function styleSheetsMatch(sheetA, sheetB) {
  for (let i = 0; i < sheetA.cssRules.length; i++) {
    let ruleA = sheetA.cssRules[i].cssText;
    let ruleB = sheetB.cssRules[i]?.cssText;
    if (ruleA !== ruleB) return false;
  }

  return true;
}

// Outputs in-memory CSSOM into their respective DOM nodes.
export function serializeCSSOM({ dom, clone, warnings, resources }, adoptedStylesMap = null) {
  for (let styleSheet of dom.styleSheets) {
    if (isCSSOM(styleSheet)) {
      let styleId = styleSheet.ownerNode.getAttribute('data-percy-element-id');
      if (!styleId) {
        let attributes = Array.from(styleSheet.ownerNode.attributes).map(attr => `${attr.name}: ${attr.value}`);
        warnings.add(`stylesheet with attributes - [ ${attributes} ] - was not serialized`);
        continue;
      }
      let cloneOwnerNode = clone.querySelector(`[data-percy-element-id="${styleId}"]`);
      if (styleSheetsMatch(styleSheet, cloneOwnerNode.sheet)) continue;
      let style = document.createElement('style');

      style.type = 'text/css';
      style.setAttribute('data-percy-element-id', styleId);
      style.setAttribute('data-percy-cssom-serialized', 'true');
      style.innerHTML = Array.from(styleSheet.cssRules)
        .map(cssRule => cssRule.cssText).join('\n');

      cloneOwnerNode.parentNode.insertBefore(style, cloneOwnerNode.nextSibling);
      cloneOwnerNode.remove();
    }
  }

  // clone stylesheets in shadowRoot
  // https://github.com/WICG/construct-stylesheets/issues/93
  if (!adoptedStylesMap) {
    adoptedStylesMap = new Map();
  }

  for (let sheet of dom.adoptedStyleSheets) {
    const styleLink = document.createElement('link');
    styleLink.setAttribute('rel', 'stylesheet');

    if (!adoptedStylesMap.has(sheet)) {
      const styles = Array.from(sheet.cssRules)
        .map(cssRule => cssRule.cssText).join('\n');
      let resource = resourceFromText(uid(), 'text/css', styles);
      resources.add(resource);
      adoptedStylesMap.set(sheet, resource.url);
    }
    styleLink.setAttribute('href', adoptedStylesMap.get(sheet));

    if (clone.constructor.name === 'HTMLDocument') {
      // handle document and iframe
      clone.body.prepend(styleLink);
    } else if (clone.constructor.name === 'ShadowRoot') {
      clone.prepend(styleLink);
    }
  }

  // find stylesheets inside shadow host and recursively serialize them.
  for (let shadowHost of dom.querySelectorAll('[data-percy-shadow-host]')) {
    let percyElementId = shadowHost.getAttribute('data-percy-element-id');
    let cloneShadowHost = clone.querySelector(`[data-percy-element-id="${percyElementId}"]`);

    if (shadowHost.shadowRoot && cloneShadowHost.shadowRoot) {
      serializeCSSOM({
        dom: shadowHost.shadowRoot,
        clone: cloneShadowHost.shadowRoot,
        resources
      }, adoptedStylesMap);
    }
  }
}

export default serializeCSSOM;
