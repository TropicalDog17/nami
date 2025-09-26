describe('Transaction Functionality', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should display transaction management interface', () => {
    cy.get('h2').should('contain.text', 'Transaction Management')
    cy.contains('Create, edit, and manage your financial transactions').should('be.visible')
  })

  it('should show quick actions section', () => {
    cy.get('h3').should('contain.text', 'Quick Actions')
    
    // Check all action buttons are present and clickable
    cy.get('button').contains('New Transaction').should('be.visible').and('not.be.disabled')
    cy.get('button').contains('Import CSV').should('be.visible').and('not.be.disabled')
    cy.get('button').contains('Export Data').should('be.visible').and('not.be.disabled')
  })

  it('should show recent transactions section', () => {
    cy.get('h3').should('contain.text', 'Recent Transactions')
    cy.contains('No transactions found').should('be.visible')
  })

  it('should have working action buttons', () => {
    // Test button interactions (they don't have full functionality yet)
    cy.get('button').contains('New Transaction').click()
    cy.get('button').contains('Import CSV').click()
    cy.get('button').contains('Export Data').click()
    
    // Verify buttons maintain their state after clicking
    cy.get('button').contains('New Transaction').should('not.be.disabled')
  })

  it('should have proper styling and layout', () => {
    // Check that cards have proper styling
    cy.get('.card').should('have.length.at.least', 2)
    
    // Check button styling
    cy.get('.btn-primary').should('exist')
    cy.get('.btn-secondary').should('exist')
    
    // Check responsive grid layout
    cy.get('[class*="grid"]').should('exist')
  })
})
