// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command to navigate to a page and verify it loads
Cypress.Commands.add('visitAndVerify', (url, expectedText) => {
  cy.visit(url)
  cy.contains(expectedText).should('be.visible')
})

// Custom command to check navigation highlighting
Cypress.Commands.add('checkActiveNavigation', (linkText) => {
  cy.contains('nav a', linkText)
    .should('have.class', 'border-blue-500')
    .and('have.class', 'text-gray-900')
})
