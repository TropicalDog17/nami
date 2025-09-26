
const AdminPage = () => {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Admin Panel</h2>
          <p className="text-gray-600 mb-6">
            Manage transaction types, accounts, assets, and tags with full audit trail.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Transaction Types</h3>
              <p className="text-gray-500 text-sm mb-4">Manage configurable transaction categories</p>
              <button className="btn btn-primary w-full">Manage Types</button>
            </div>
            
            <div className="card p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Accounts</h3>
              <p className="text-gray-500 text-sm mb-4">Manage cash, bank, and investment accounts</p>
              <button className="btn btn-primary w-full">Manage Accounts</button>
            </div>
            
            <div className="card p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Assets</h3>
              <p className="text-gray-500 text-sm mb-4">Manage currencies and tokens</p>
              <button className="btn btn-primary w-full">Manage Assets</button>
            </div>
            
            <div className="card p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Tags</h3>
              <p className="text-gray-500 text-sm mb-4">Manage categorization tags</p>
              <button className="btn btn-primary w-full">Manage Tags</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPage
