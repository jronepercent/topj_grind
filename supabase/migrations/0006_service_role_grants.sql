-- With "Automatically expose new tables" off, the service role (our server) gets no table privileges
-- either. It needs full access — it already bypasses RLS, and only server code holds its key.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables, sequences and functions created by later migrations get the same.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
