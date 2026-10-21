"""Value/configuration distinctions in unrelated local compositions."""
import torch


class ConfigurationOnly:
    def forward(self, x, resource):
        return x + resource[:, :x.size(1)].to(dtype=x.dtype)


class ExemplarOnly:
    def forward(self, x, resource):
        return x + resource.to(x)


class AllocationOnly:
    def forward(self, x):
        return x + torch.zeros_like(x) + torch.randn_like(x)


class ShapeOnly:
    def forward(self, x, resource):
        return x + resource.reshape(x.shape)


class TrueValue:
    def forward(self, x, resource):
        return x + torch.relu(x).to(resource)


class FunctionalValue:
    def forward(self, x):
        return x + torch.softmax(input=x, dim=-1)


class MixedValues:
    def configure(self, x, resource):
        return resource.to(x)

    def forward(self, x, resource):
        configured = self.configure(x, resource)
        real_branch = torch.relu(x) + configured
        return x + real_branch, unknown_kernel(configured)


class ConditionalValues:
    def forward(self, x, resource, flag):
        if flag:
            branch = torch.relu(x)
        else:
            branch = resource.to(x)
        return x + branch


class IndexValues:
    def forward(self, x, table):
        return x + table[x]
