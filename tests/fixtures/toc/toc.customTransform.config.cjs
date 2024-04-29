module.exports = {
  entryContext: 'manuscript',
  entry: ['section.html'],
  workspaceDir: '.vs-customTransform',
  toc: {
    sectionDepth: 6,
    transformDocumentList:
      (nodeList) =>
      ({ children }) => ({
        type: 'element',
        tagName: 'div',
        properties: {
          className: 'doc-list',
          dataNodeLength: nodeList.length,
        },
        children,
      }),
    transformDocumentListItem:
      ({ title, href, sections, children: childDoc }) =>
      ({ children }) => ({
        type: 'element',
        tagName: 'div',
        properties: {
          className: 'doc-list-item',
          dataContent: JSON.stringify({ title, href }),
          dataSections: JSON.stringify(sections),
          dataChildren: JSON.stringify(childDoc),
        },
        children,
      }),
    transformSectionList:
      (nodeList) =>
      ({ children }) => ({
        type: 'element',
        tagName: 'div',
        properties: {
          className: 'sec-list',
          dataNodeLength: nodeList.length,
        },
        children,
      }),
    transformSectionListItem:
      ({ headingText, href, level, id, children: childSec }) =>
      ({ children }) => ({
        type: 'element',
        tagName: 'div',
        properties: {
          className: 'sec-list-item',
          dataContent: JSON.stringify({ headingText, href, level, id }),
          dataChildren: JSON.stringify(childSec),
        },
        children,
      }),
  },
};
